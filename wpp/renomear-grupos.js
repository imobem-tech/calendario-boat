// ============================================================
// wpp/renomear-grupos.js
// Endpoint POST /renomear-grupos
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

async function buscarRegistros() {
  const { rows } = await pool.query(`
    SELECT 
      a."Cod_Embarcacao",
      a."Gropo_letra",
      a."Cod_Pessoa",
      REPLACE(c."Cliente_Telefone_Celular", '+', '') || '@s.whatsapp.net' AS jid_dono
    FROM public."P_BOAT_4_Autorizados" a
    JOIN public."Cliente" c ON c."Codigo" = a."Cod_Pessoa"
    WHERE a."Dt_Desautorizacao" IS NULL
      AND a."Gropo_letra" != 'X1'
      AND c."Cliente_Telefone_Celular" IS NOT NULL
    ORDER BY a."Cod_Embarcacao", a."Gropo_letra"
  `)
  return rows
}

function filtrarGruposDaEmbarcacao(grupos, codEmbarcacao) {
  const prefixo = `${codEmbarcacao}-`
  return grupos.filter(g => g.subject.startsWith(prefixo))
}

function montarNovoNome(nomeAtual, codEmbarcacao, gropoLetra) {
  const prefixoAtual = `${codEmbarcacao}-`
  const prefixoNovo  = `${codEmbarcacao}-${gropoLetra}-`

  if (!nomeAtual.startsWith(prefixoAtual)) return null

  const resto = nomeAtual.slice(prefixoAtual.length)

  if (resto.startsWith(`${gropoLetra}-`)) return nomeAtual

  return prefixoNovo + resto
}

async function criarGrupo(sock, codEmbarcacao, gropoLetra, jidDono) {
  const nomeGrupo = `${codEmbarcacao}-${gropoLetra}-NOVO`
  const membros = [jidDono, ADM2_JID].filter(Boolean)

  const result = await sock.groupCreate(nomeGrupo, membros)
  const novoId = result.id

  await sock.groupParticipantsUpdate(novoId, membros, 'promote')

  console.log(`[CRIADO] ${nomeGrupo} → ${novoId}`)
  return { acao: 'criado', grupoId: novoId, nomeGrupo }
}

export async function handleRenomearGrupos(req, res, getSock, getConectado) {
  const sock = getSock()
  const conectado = getConectado()
  const log = []

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' })
  }

  try {
    const registros = await buscarRegistros()

    const gruposWpp = await sock.groupFetchAllParticipating()
    const grupos = Object.entries(gruposWpp).map(([id, data]) => ({
      id,
      subject: data.subject,
      participants: data.participants.map(p => p.id),
    }))

    const porEmbarcacao = {}
    for (const reg of registros) {
      const cod = reg.Cod_Embarcacao
      if (!porEmbarcacao[cod]) porEmbarcacao[cod] = []
      porEmbarcacao[cod].push(reg)
    }

    for (const [codStr, regs] of Object.entries(porEmbarcacao)) {
      const cod = parseInt(codStr)
      const gruposDoBarco = filtrarGruposDaEmbarcacao(grupos, cod)

      for (const reg of regs) {
        const { Gropo_letra, jid_dono } = reg

        // Caso 1: 1 registro + 1 grupo → renomeia direto
        if (regs.length === 1 && gruposDoBarco.length === 1) {
          const grupo    = gruposDoBarco[0]
          const novoNome = montarNovoNome(grupo.subject, cod, Gropo_letra)

          if (!novoNome) {
            log.push({ cod, Gropo_letra, status: 'SKIP', motivo: 'nome inesperado' })
            continue
          }
          if (novoNome === grupo.subject) {
            log.push({ cod, Gropo_letra, status: 'JA_OK', nome: novoNome })
            continue
          }

          await sock.groupUpdateSubject(grupo.id, novoNome)
          log.push({ cod, Gropo_letra, status: 'RENOMEADO', de: grupo.subject, para: novoNome })
          continue
        }

        // Caso 2: múltiplos → matching por celular
        const grupoMatch = gruposDoBarco.find(g => g.participants.includes(jid_dono))

        if (grupoMatch) {
          const novoNome = montarNovoNome(grupoMatch.subject, cod, Gropo_letra)

          if (!novoNome) {
            log.push({ cod, Gropo_letra, status: 'SKIP', motivo: 'nome inesperado' })
            continue
          }
          if (novoNome === grupoMatch.subject) {
            log.push({ cod, Gropo_letra, status: 'JA_OK', nome: novoNome })
            continue
          }

          await sock.groupUpdateSubject(grupoMatch.id, novoNome)
          log.push({ cod, Gropo_letra, status: 'RENOMEADO', de: grupoMatch.subject, para: novoNome })

        } else {
          // Caso 3: sem grupo → cria novo
          if (!jid_dono) {
            log.push({ cod, Gropo_letra, status: 'SKIP', motivo: 'sem jid_dono' })
            continue
          }

          const resultado = await criarGrupo(sock, cod, Gropo_letra, jid_dono)
          log.push({ cod, Gropo_letra, status: 'CRIADO', ...resultado })
        }
      }
    }

    return res.json({ sucesso: true, total: log.length, log })

  } catch (err) {
    console.error('[renomear-grupos] ERRO:', err)
    return res.status(500).json({ sucesso: false, erro: err.message, log })
  }
}
