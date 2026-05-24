// ============================================================
// wpp/criar-ou-atualizar-grupo.js
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

function montarNomeGrupo(codEmbarcacao, gropoLetra, codCliente, plano) {
  const unidade = String(plano || '').toLowerCase().includes('ctg') ? 'C' : 'G'
  const descricao = Number(codCliente) === 4255 ? 'ALLMAX COTAS' : 'SUMMER NÁUTICA'
  return `${codEmbarcacao}-${gropoLetra} _${unidade} ${descricao}`
}

async function buscarJidDono(codPessoa) {
  const { rows } = await pool.query(`
    SELECT REPLACE("Cliente_Telefone_Celular", '+', '') || '@s.whatsapp.net' AS jid_dono
    FROM public."Cliente"
    WHERE "Codigo" = $1
      AND "Cliente_Telefone_Celular" IS NOT NULL
    LIMIT 1
  `, [codPessoa])
  if (rows.length === 0) return null
  return rows[0].jid_dono
}

function variacoesNumero(jid) {
  const numero = jid.replace('@s.whatsapp.net', '')
  const variacoes = [numero]
  const sem9 = numero.replace(/^(\d{4})9(\d{8})$/, '$1$2')
  if (sem9 !== numero) variacoes.push(sem9)
  const com9 = numero.replace(/^(\d{4})(\d{8})$/, '$19$2')
  if (com9 !== numero) variacoes.push(com9)
  return variacoes
}

function encontrarGrupoPorJid(gruposDoBarco, jidDono) {
  const variacoes = variacoesNumero(jidDono)
  for (const grupo of gruposDoBarco) {
    for (const variacao of variacoes) {
      if (grupo.participants.some(p => p.startsWith(variacao))) {
        return { grupo, variacaoUsada: variacao }
      }
    }
  }
  return null
}

export async function handleCriarOuAtualizarGrupo(req, res, getSock, getConectado) {
  const sock = getSock()
  const conectado = getConectado()
  const log = []

  const addLog = (msg) => {
    console.log('[criar-grupo]', msg)
    log.push(msg)
  }

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado', log })
  }

  const { Cod_Embarcacao, Gropo_letra, Cod_Pessoa, Cod_Cliente, Plano } = req.body
  addLog(`Recebido: PB=${Cod_Embarcacao} Letra=${Gropo_letra} Pessoa=${Cod_Pessoa} Cliente=${Cod_Cliente} Plano=${Plano}`)

  if (!Cod_Embarcacao || !Gropo_letra || !Cod_Pessoa || !Cod_Cliente || !Plano) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando', log })
  }

  try {
    // 1. Busca JID
    addLog('Buscando JID do dono...')
    const jidDono = await buscarJidDono(Cod_Pessoa)
    if (!jidDono) {
      addLog(`JID não encontrado para Cod_Pessoa=${Cod_Pessoa}`)
      return res.status(404).json({ erro: `Celular não encontrado para Cod_Pessoa ${Cod_Pessoa}`, log })
    }
    addLog(`JID encontrado: ${jidDono} | variações: ${variacoesNumero(jidDono).join(', ')}`)

    // 2. Monta nome correto
    const nomeCorreto = montarNomeGrupo(Cod_Embarcacao, Gropo_letra, Cod_Cliente, Plano)
    addLog(`Nome correto do grupo: ${nomeCorreto}`)

    // 3. Busca grupos
    addLog('Buscando grupos do WhatsApp...')
    const gruposWpp = await sock.groupFetchAllParticipating()
    const grupos = Object.entries(gruposWpp).map(([id, data]) => ({
      id,
      subject: data.subject,
      participants: data.participants.map(p => p.id),
    }))
    addLog(`Total de grupos encontrados: ${grupos.length}`)

    // 4. Filtra grupos da embarcação (qualquer separador após o código)
    const codStr = String(Cod_Embarcacao)
    const gruposDoBarco = grupos.filter(g => {
      const subject = g.subject.trim()
      return new RegExp(`^${codStr}\\D`).test(subject)
    })
    addLog(`Grupos da embarcação ${Cod_Embarcacao}: ${gruposDoBarco.map(g => g.subject).join(', ') || 'nenhum'}`)

    let grupoMatch = null

    if (gruposDoBarco.length === 1) {
      grupoMatch = gruposDoBarco[0]
      addLog(`Apenas 1 grupo, usando direto: ${grupoMatch.subject}`)
    } else if (gruposDoBarco.length > 1) {
      const resultado = encontrarGrupoPorJid(gruposDoBarco, jidDono)
      if (resultado) {
        grupoMatch = resultado.grupo
        addLog(`Match encontrado via número ${resultado.variacaoUsada}: ${grupoMatch.subject}`)
      } else {
        addLog(`Nenhum match entre ${gruposDoBarco.length} grupos — será criado novo grupo`)
      }
    }

    // 5. Renomeia se encontrou
    if (grupoMatch) {
      if (grupoMatch.subject === nomeCorreto) {
        addLog('Grupo já está com o nome correto')
        return res.json({ acao: 'JA_OK', grupoId: grupoMatch.id, nome: grupoMatch.subject, log })
      }
      addLog(`Renomeando de "${grupoMatch.subject}" para "${nomeCorreto}"`)
      await sock.groupUpdateSubject(grupoMatch.id, nomeCorreto)
      addLog('Renomeado com sucesso!')
      return res.json({ acao: 'RENOMEADO', grupoId: grupoMatch.id, de: grupoMatch.subject, para: nomeCorreto, log })
    }

    // 6. Cria novo grupo — sem retry para evitar timeout
    addLog(`Criando novo grupo: ${nomeCorreto}`)
    
    
const membrosBrutos = [jidDono, ADM2_JID]
addLog(`Membros brutos: ${membrosBrutos.join(', ')}`)

const membrosValidos = []

for (const jid of membrosBrutos) {
  try {
    const numero = jid.replace('@s.whatsapp.net', '')
    const check = await sock.onWhatsApp(numero)

    if (check && check.length > 0 && check[0].exists) {
      membrosValidos.push(check[0].jid)
      addLog(`JID válido no WhatsApp: ${check[0].jid}`)
    } else {
      addLog(`JID NÃO encontrado no WhatsApp: ${jid}`)
    }
  } catch (e) {
    addLog(`Erro ao validar JID ${jid}: ${e.message}`)
  }
}

if (membrosValidos.length === 0) {
  return res.status(400).json({
    erro: 'Nenhum membro válido para criar o grupo',
    membrosBrutos,
    log
  })
}

addLog(`Membros válidos para criação: ${membrosValidos.join(', ')}`)

try {
  const result = await sock.groupCreate(nomeCorreto, membrosValidos)
  const novoId = result.id
  addLog(`Grupo criado: ${novoId}`)

  try {
    await sock.groupParticipantsUpdate(novoId, membrosValidos, 'promote')
    addLog('Membros promovidos a admin')
  } catch (errPromote) {
    addLog(`Grupo criado, mas falhou ao promover admins: ${errPromote.message}`)
  }

  return res.json({
    acao: 'CRIADO',
    grupoId: novoId,
    nomeGrupo: nomeCorreto,
    jidDono,
    membrosValidos,
    log
  })

} catch (errCreate) {
  addLog(`ERRO ao criar grupo: ${errCreate.message}`)
  addLog(`Detalhe erro: ${JSON.stringify(errCreate, Object.getOwnPropertyNames(errCreate))}`)

  return res.status(500).json({
    erro: `Falha ao criar grupo: ${errCreate.message}`,
    detalhe: JSON.stringify(errCreate, Object.getOwnPropertyNames(errCreate)),
    membrosValidos,
    log
  })
}

    
  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    console.error('[criar-ou-atualizar-grupo] ERRO:', err)
    return res.status(500).json({ erro: err.message, log })
  }
}
