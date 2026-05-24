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
    addLog(`JID encontrado: ${jidDono}`)

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
    const prefixo = `${Cod_Embarcacao}-`
    const gruposDoBarco = grupos.filter(g => g.subject.startsWith(prefixo))
    addLog(`Grupos da embarcação ${Cod_Embarcacao}: ${gruposDoBarco.map(g => g.subject).join(', ') || 'nenhum'}`)

    // 5. Matching por JID
    const grupoMatch = gruposDoBarco.find(g => g.participants.includes(jidDono))
    if (grupoMatch) {
      addLog(`Grupo encontrado: ${grupoMatch.subject} (${grupoMatch.id})`)
    } else {
      addLog(`Nenhum grupo encontrado com o JID ${jidDono}`)
      addLog(`Participantes dos grupos do barco: ${gruposDoBarco.map(g => g.subject + ':' + g.participants.join(',')).join(' | ')}`)
    }

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

    // 6. Cria novo grupo
    addLog(`Criando novo grupo: ${nomeCorreto}`)
    const membros = [jidDono, ADM2_JID].filter(Boolean)
    addLog(`Membros: ${membros.join(', ')}`)
    const result = await sock.groupCreate(nomeCorreto, membros)
    const novoId = result.id
    addLog(`Grupo criado: ${novoId}`)

    await sock.groupParticipantsUpdate(novoId, membros, 'promote')
    addLog('Membros promovidos a admin')

    return res.json({ acao: 'CRIADO', grupoId: novoId, nomeGrupo: nomeCorreto, jidDono, log })

  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    console.error('[criar-ou-atualizar-grupo] ERRO:', err)
    return res.status(500).json({ erro: err.message, log })
  }
}
