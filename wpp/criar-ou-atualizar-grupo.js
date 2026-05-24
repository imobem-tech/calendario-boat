// ============================================================
// wpp/criar-ou-atualizar-grupo.js
// Endpoint POST /criar-ou-atualizar-grupo
// Recebe: { Cod_Embarcacao, Gropo_letra, Cod_Pessoa, Cod_Cliente, Plano }
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

// -------------------------------------------------------
// Monta o nome do grupo com base nas regras de negócio
// {Cod_Embarcacao}-{Gropo_letra} _{Unidade} {Descricao}
// -------------------------------------------------------
function montarNomeGrupo(codEmbarcacao, gropoLetra, codCliente, plano) {
  const unidade = String(plano || '').toLowerCase().includes('ctg') ? 'C' : 'G'
  const descricao = Number(codCliente) === 4255 ? 'ALLMAX COTAS' : 'SUMMER NÁUTICA'
  return `${codEmbarcacao}-${gropoLetra} _${unidade} ${descricao}`
}

// -------------------------------------------------------
// Busca o JID do dono a partir do Cod_Pessoa
// -------------------------------------------------------
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

// -------------------------------------------------------
// Handler principal
// -------------------------------------------------------
export async function handleCriarOuAtualizarGrupo(req, res, getSock, getConectado) {
  const sock = getSock()
  const conectado = getConectado()

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' })
  }

  const { Cod_Embarcacao, Gropo_letra, Cod_Pessoa, Cod_Cliente, Plano } = req.body

  if (!Cod_Embarcacao || !Gropo_letra || !Cod_Pessoa || !Cod_Cliente || !Plano) {
    return res.status(400).json({ erro: 'Cod_Embarcacao, Gropo_letra, Cod_Pessoa, Cod_Cliente e Plano são obrigatórios' })
  }

  try {
    // 1. Busca JID do dono
    const jidDono = await buscarJidDono(Cod_Pessoa)
    if (!jidDono) {
      return res.status(404).json({ erro: `Celular não encontrado para Cod_Pessoa ${Cod_Pessoa}` })
    }

    // 2. Monta o nome correto do grupo
    const nomeCorreto = montarNomeGrupo(Cod_Embarcacao, Gropo_letra, Cod_Cliente, Plano)

    // 3. Busca todos os grupos do WhatsApp
    const gruposWpp = await sock.groupFetchAllParticipating()
    const grupos = Object.entries(gruposWpp).map(([id, data]) => ({
      id,
      subject: data.subject,
      participants: data.participants.map(p => p.id),
    }))

    // 4. Tenta encontrar grupo pelo JID do dono em grupos da embarcação
    const prefixo = `${Cod_Embarcacao}-`
    const gruposDoBarco = grupos.filter(g => g.subject.startsWith(prefixo))
    const grupoMatch = gruposDoBarco.find(g => g.participants.includes(jidDono))

    if (grupoMatch) {
      // Grupo já existe → verifica se nome precisa atualizar
      if (grupoMatch.subject === nomeCorreto) {
        return res.json({
          acao: 'JA_OK',
          grupoId: grupoMatch.id,
          nome: grupoMatch.subject
        })
      }

      await sock.groupUpdateSubject(grupoMatch.id, nomeCorreto)
      return res.json({
        acao: 'RENOMEADO',
        grupoId: grupoMatch.id,
        de: grupoMatch.subject,
        para: nomeCorreto
      })
    }

    // 5. Grupo não existe → cria novo
    const membros = [jidDono, ADM2_JID].filter(Boolean)
    const result = await sock.groupCreate(nomeCorreto, membros)
    const novoId = result.id

    await sock.groupParticipantsUpdate(novoId, membros, 'promote')

    console.log(`[CRIADO] ${nomeCorreto} → ${novoId}`)

    return res.json({
      acao: 'CRIADO',
      grupoId: novoId,
      nomeGrupo: nomeCorreto,
      jidDono
    })

  } catch (err) {
    console.error('[criar-ou-atualizar-grupo] ERRO:', err)
    return res.status(500).json({ erro: err.message })
  }
}
