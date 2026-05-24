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

// Gera variações do número para matching (com e sem o 9º dígito)
function variacoesNumero(jid) {
  const numero = jid.replace('@s.whatsapp.net', '')
  const variacoes = [numero]

  // Remove o 9 extra: 5563984380383 → 556384880383
  const sem9 = numero.replace(/^(\d{4})9(\d{8})$/, '$1$2')
  if (sem9 !== numero) variacoes.push(sem9)

  // Adiciona o 9: 556384880383 → 5563984880383
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

  // 4. Filtra grupos da embarcação

    // 5. Nenhum grupo encontrado → cria novo
    addLog(`Criando novo grupo: ${nomeCorreto}`)
    const membros = [jidDono, ADM2_JID]

    // Tenta criar com retry em caso de bad-request
    let result = null
    let tentativa = 0
    const maxTentativas = 3

    while (tentativa < maxTentativas) {
      try {
        tentativa++
        addLog(`Tentativa ${tentativa} de criar grupo...`)
        result = await sock.groupCreate(nomeCorreto, membros)
        addLog(`Grupo criado com sucesso na tentativa ${tentativa}: ${result.id}`)
        break
      } catch (errCreate) {
        addLog(`Tentativa ${tentativa} falhou: ${errCreate.message}`)
        if (tentativa < maxTentativas) {
          addLog('Aguardando 3 segundos antes de tentar novamente...')
          await new Promise(r => setTimeout(r, 3000))
        }
      }
    }

    if (!result) {
      addLog('Todas as tentativas de criar grupo falharam')
      return res.status(500).json({ erro: 'Não foi possível criar o grupo após 3 tentativas', log })
    }

    const novoId = result.id
    await sock.groupParticipantsUpdate(novoId, membros, 'promote')
    addLog('Membros promovidos a admin')

    return res.json({ acao: 'CRIADO', grupoId: novoId, nomeGrupo: nomeCorreto, jidDono, log })

  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    console.error('[criar-ou-atualizar-grupo] ERRO:', err)
    return res.status(500).json({ erro: err.message, log })
  }
}
