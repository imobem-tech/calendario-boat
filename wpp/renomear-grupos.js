// ============================================================
// wpp/renomear-grupos.js — V.2605301500
// Endpoint POST /renomear-grupos  e  POST /grupos/renomear
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

import { sincronizarColaboradoresGrupo, adicionarTitularGrupo, cancelarGrupo, unidadeDoPlano, empresaDaLetra } from './grupos-admin.js'

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

// ------------------------------------------------------------
// Abrevia nome: "DANILO ALVES COSTA" → "DANILO A" (inicial do segundo nome)
// ------------------------------------------------------------
function abreviarNome(nomeCompleto) {
  const partes = String(nomeCompleto || '').trim().toUpperCase().split(/\s+/)
  if (partes.length <= 1) return partes[0] || ''
  return partes[0] + ' ' + partes[1][0]
}

// ------------------------------------------------------------
// Monta nome do grupo:
// Ex: pb=576, letra="X4", plano="Plano_A_ctg", nome="DANILO ALVES COSTA"
//   → "576-X4 _C ALLMAX (DANILO A)"
// Empresa: letra começa com letra → ALLMAX, com número → SUMMER
// Unidade: últimas 3 letras do plano = "ctg" → _C, senão → _G
// ------------------------------------------------------------
function montarNomeGrupoUnico(pb, letra, plano, nomeCliente) {
  const unidade = unidadeDoPlano(plano)
  const empresa  = empresaDaLetra(letra)
  const abrev    = abreviarNome(nomeCliente)
  return `${pb}-${letra} _${unidade} ${empresa} (${abrev})`
}

// ============================================================
// POST /grupos/renomear
// Renomeia UM grupo, adiciona titular e sincroniza colaboradores
// Body: { pb, letra, cod_cliente, plano, nome_cliente }
// ============================================================
export async function handleRenomearGrupoUnico(req, res, getSock, getConectado) {
  const sock = getSock()
  const conectado = getConectado()

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' })
  }

  const { pb, letra, cod_cliente, plano, nome_cliente } = req.body

  if (!pb || !letra || !cod_cliente || !plano || !nome_cliente) {
    return res.status(400).json({ erro: 'Campos obrigatórios: pb, letra, cod_cliente, plano, nome_cliente' })
  }

  const log = []
  const addLog = msg => { console.log('[grupos/renomear]', msg); log.push(msg) }

  try {
    // 1. Busca o grupo na tabela
    const rs = await pool.query(
      `SELECT grupowppid, nomegrupowpp FROM public.wpp_grupos_agenda
       WHERE pb = $1 AND UPPER(COALESCE(cota, '')) = UPPER($2) LIMIT 1`,
      [pb, letra]
    )

    if (rs.rowCount === 0) {
      return res.status(404).json({ erro: `Grupo não encontrado para pb=${pb} letra=${letra}` })
    }

    const { grupowppid, nomegrupowpp } = rs.rows[0]
    const unidadeGrupo = unidadeDoPlano(plano)
    const novoNome = montarNomeGrupoUnico(pb, letra, plano, nome_cliente)

    // 2. Renomear (se necessário)
    let acaoRenomear
    if (novoNome === nomegrupowpp) {
      addLog(`Nome já correto: "${novoNome}"`)
      acaoRenomear = 'JA_OK'
    } else {
      await sock.groupUpdateSubject(grupowppid, novoNome)
      await pool.query(
        `UPDATE public.wpp_grupos_agenda
            SET nomegrupowpp = $1, dataatualizacao = NOW() AT TIME ZONE 'America/Sao_Paulo'
          WHERE grupowppid = $2`,
        [novoNome, grupowppid]
      )
      addLog(`Renomeado: "${nomegrupowpp}" → "${novoNome}"`)
      acaoRenomear = 'RENOMEADO'
    }

    // 3. Fluxo CANCELADO: remove todos e recoloca só admins
    if (plano.toLowerCase() === 'cancelado') {
      let cancelamento = {}
      try {
        cancelamento = await cancelarGrupo(sock, pool, grupowppid, unidadeGrupo, addLog)
      } catch (err) {
        addLog(`AVISO cancelamento: ${err.message}`)
        cancelamento = { erro: err.message }
      }
      return res.json({
        acao: acaoRenomear,
        de: nomegrupowpp,
        para: novoNome,
        cancelamento,
        log
      })
    }

    // 4. Fluxo NORMAL: adicionar titular + sincronizar colaboradores
    let titular = {}
    try {
      titular = await adicionarTitularGrupo(sock, pool, grupowppid, cod_cliente, addLog)
    } catch (err) {
      addLog(`AVISO titular: ${err.message}`)
      titular = { acao: 'ERRO', erro: err.message }
    }

    let colaboradores = {}
    try {
      colaboradores = await sincronizarColaboradoresGrupo(sock, pool, grupowppid, unidadeGrupo, addLog)
    } catch (err) {
      addLog(`AVISO colaboradores: ${err.message}`)
      colaboradores = { erro: err.message }
    }

    return res.json({
      acao: acaoRenomear,
      de: nomegrupowpp,
      para: novoNome,
      titular,
      colaboradores,
      log
    })

  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    console.error('[grupos/renomear] ERRO:', err)
    return res.status(500).json({ erro: err.message, log })
  }
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
