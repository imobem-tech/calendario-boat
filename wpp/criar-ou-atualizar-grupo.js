// ============================================================
// wpp/criar-ou-atualizar-grupo.js
// Endpoint POST /criar-ou-atualizar-grupo
// Recebe: { Cod_Embarcacao, Gropo_letra, Cod_Pessoa }
// Verifica se grupo já existe → renomeia ou cria
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

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
// Busca nome da embarcação para compor o nome do grupo
// -------------------------------------------------------
async function buscarNomeEmbarcacao(codEmbarcacao) {
  const { rows } = await pool.query(`
    SELECT "Nome_Embarcacao"
    FROM public."Embarcacao"
    WHERE "Codigo" = $1
    LIMIT 1
  `, [codEmbarcacao])

  if (rows.length === 0) return null
  return rows[0].Nome_Embarcacao
}

// -------------------------------------------------------
// Monta o novo nome: {cod}-{letra}-{descricao}
// -------------------------------------------------------
function montarNovoNome(nomeAtual, codEmbarcacao, gropoLetra) {
  const prefixoAtual = `${codEmbarcacao}-`
  const prefixoNovo  = `${codEmbarcacao}-${gropoLetra}-`

  if (!nomeAtual.startsWith(prefixoAtual)) return null

  const resto = nomeAtual.slice(prefixoAtual.length)

  // Já está no formato correto?
  if (resto.startsWith(`${gropoLetra}-`)) return nomeAtual

  return prefixoNovo + resto
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

  const { Cod_Embarcacao, Gropo_letra, Cod_Pessoa } = req.body

  if (!Cod_Embarcacao || !Gropo_letra || !Cod_Pessoa) {
    return res.status(400).json({ erro: 'Cod_Embarcacao, Gropo_letra e Cod_Pessoa são obrigatórios' })
  }

  try {
    // 1. Busca JID do dono
    const jidDono = await buscarJidDono(Cod_Pessoa)
    if (!jidDono) {
      return res.status(404).json({ erro: `Celular não encontrado para Cod_Pessoa ${Cod_Pessoa}` })
    }

    // 2. Busca todos os grupos do WhatsApp
    const gruposWpp = await sock.groupFetchAllParticipating()
    const grupos = Object.entries(gruposWpp).map(([id, data]) => ({
      id,
      subject: data.subject,
      participants: data.participants.map(p => p.id),
    }))

    // 3. Filtra grupos da embarcação
    const prefixo = `${Cod_Embarcacao}-`
    const gruposDoBarco = grupos.filter(g => g.subject.startsWith(prefixo))

    // 4. Tenta encontrar grupo pelo JID do dono
    const grupoMatch = gruposDoBarco.find(g => g.participants.includes(jidDono))

    if (grupoMatch) {
      // Grupo já existe → verifica se nome precisa atualizar
      const novoNome = montarNovoNome(grupoMatch.subject, Cod_Embarcacao, Gropo_letra)

      if (!novoNome || novoNome === grupoMatch.subject) {
        return res.json({
          acao: 'JA_OK',
          grupoId: grupoMatch.id,
          nome: grupoMatch.subject
        })
      }

      await sock.groupUpdateSubject(grupoMatch.id, novoNome)
      return res.json({
        acao: 'RENOMEADO',
        grupoId: grupoMatch.id,
        de: grupoMatch.subject,
        para: novoNome
      })
    }

    // 5. Grupo não existe → cria novo
    // Tenta buscar nome da embarcação para compor o nome do grupo
    const nomeEmb = await buscarNomeEmbarcacao(Cod_Embarcacao)
    const descricao = nomeEmb ? nomeEmb.toUpperCase() : 'NOVO'
    const nomeGrupo = `${Cod_Embarcacao}-${Gropo_letra}-${descricao}`

    const membros = [jidDono, ADM2_JID].filter(Boolean)
    const result = await sock.groupCreate(nomeGrupo, membros)
    const novoId = result.id

    await sock.groupParticipantsUpdate(novoId, membros, 'promote')

    console.log(`[CRIADO] ${nomeGrupo} → ${novoId}`)

    return res.json({
      acao: 'CRIADO',
      grupoId: novoId,
      nomeGrupo,
      jidDono
    })

  } catch (err) {
    console.error('[criar-ou-atualizar-grupo] ERRO:', err)
    return res.status(500).json({ erro: err.message })
  }
}
