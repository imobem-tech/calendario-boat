// ============================================================
// wpp/alerta_hm_retorno.js — V.2606011928-HM11
// Allmax Gestão de Cotas — Marujo⚓
//
// Rotina automática das 11h:
// - Verifica saídas Allmax (Cod_Proprietário = 4255)
// - Ignora desistência/cancelamento
// - Considera somente saída registrada
// - Dispara alerta quando Hora_Motor_Retorno está NULL
// - Dt_Retorno é independente: pode estar preenchido ou nulo
// - Envia UMA mensagem por pendência ao grupo espelho retorno
// ============================================================

const TIMEZONE_BR = 'America/Sao_Paulo'

// ID do grupo espelho de retorno.
// Este é o grupo onde são espelhadas as confirmações de retorno e alertas de HM pendente.
const GRUPO_ESPELHO_RETORNO_ID = '120363426928542914@g.us'

const PAUSA_ENTRE_ENVIOS_MS = 1800

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function agoraBrasil() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE_BR }))
}

function hojeIsoBrasil() {
  const d = agoraBrasil()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nomeDiaSemana(d) {
  return ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][d.getDay()]
}

function fmtDataHoraBR(valor) {
  if (!valor) return '—'

  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'

  return d.toLocaleString('pt-BR', {
    timeZone: TIMEZONE_BR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function fmtDataBR(valor) {
  if (!valor) return '—'

  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'

  return d.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE_BR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function fmtHM(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'

  const n = Number(String(valor).replace(',', '.'))
  if (Number.isFinite(n)) {
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })
  }

  return String(valor).replace('.', ',')
}

function texto(valor, fallback = '—') {
  const s = String(valor ?? '').trim()
  return s || fallback
}

function montarEmbGrupo(r) {
  const pb = texto(r.cod_emb_pb)
  const grupo = texto(r.grupo_comp_letra)
  return `${pb}-${grupo}`
}

// ============================================================
// REGRA DE TRABALHO DA MARINA
// ============================================================
// Normal:
// - Domingo trabalha
// - Segunda não trabalha
// - Terça a sábado trabalha
//
// Exceção de feriado começando na segunda:
// - Feriado sempre trabalha
// - A folga compensatória cai no primeiro dia NÃO feriado após a sequência
//
// Exemplos:
// - Segunda feriado                 => trabalha segunda; folga terça
// - Segunda + terça feriado         => trabalha ambas; folga quarta
// - Segunda + terça + quarta feriado=> trabalha os três; folga quinta
// ============================================================
async function ehDiaTrabalhoMarina(pool) {
  const rs = await pool.query(`
    WITH RECURSIVE base AS (
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
    ),
    feriados AS (
      SELECT DATE(f."Dt_Feriado") AS data
        FROM public."Agenda_comp_02_feriados" f
       WHERE f."Dt_Exclusao" IS NULL
    ),
    info_hoje AS (
      SELECT b.hoje,
             EXTRACT(DOW FROM b.hoje)::int AS dow,
             EXISTS (SELECT 1 FROM feriados f WHERE f.data = b.hoje) AS feriado_hoje
        FROM base b
    ),
    seq_feriado_anterior AS (
      SELECT (h.hoje - INTERVAL '1 day')::date AS data
        FROM info_hoje h
       WHERE EXISTS (SELECT 1 FROM feriados f WHERE f.data = h.hoje - INTERVAL '1 day')

      UNION ALL

      SELECT (s.data - INTERVAL '1 day')::date AS data
        FROM seq_feriado_anterior s
       WHERE EXISTS (SELECT 1 FROM feriados f WHERE f.data = s.data - INTERVAL '1 day')
    ),
    inicio_seq AS (
      SELECT MIN(data) AS data_inicio
        FROM seq_feriado_anterior
    )
    SELECT h.hoje,
           h.dow,
           h.feriado_hoje,
           COALESCE(EXTRACT(DOW FROM i.data_inicio)::int = 1, false) AS folga_compensatoria
      FROM info_hoje h
      LEFT JOIN inicio_seq i ON true
  `)

  const r = rs.rows[0] || {}
  const dow = Number(r.dow) // 0=domingo, 1=segunda, ... 6=sábado
  const feriadoHoje = r.feriado_hoje === true
  const folgaCompensatoria = r.folga_compensatoria === true

  if (feriadoHoje) return true
  if (folgaCompensatoria) return false
  if (dow === 1) return false

  return dow === 0 || (dow >= 2 && dow <= 6)
}

async function buscarPendenciasHMRetorno(pool) {
  const rs = await pool.query(`
    SELECT s."ID"                         AS id_saida,
           s."Cod_Emb_PB"                 AS cod_emb_pb,
           s."Grupo_Comp_letra"           AS grupo_comp_letra,
           s."Cod_Autorizado"             AS cod_autorizado,
           s."Dt_Agendamento"             AS dt_agendamento,
           s."Dt_Saída"                   AS dt_saida,
           s."Dt_Retorno"                 AS dt_retorno,
           s."Hora_Motor_Saida"           AS hm_saida,
           s."Hora_Motor_Retorno"         AS hm_retorno,
           s."Cod_Proprietário"           AS cod_proprietario,
           e."Nome_Embar"                 AS nome_embarcacao,
           e."Tipo_Embar"                 AS tipo_embarcacao,
           c."Cliente_Nome"               AS nome_autorizado,
           g.nomegrupowpp                  AS nome_grupo_wpp,
           g.grupowppid                    AS grupo_wpp_id
      FROM public."P_BOAT_z_10_Saida_Emb" s
      LEFT JOIN public."P_BOAT_1_Embarcacao" e
        ON e."Num_PB" = s."Cod_Emb_PB"
      LEFT JOIN public."Cliente" c
        ON c."Codigo" = s."Cod_Autorizado"
      LEFT JOIN public.wpp_grupos_agenda g
        ON g.pb = s."Cod_Emb_PB"
       AND UPPER(COALESCE(g.cota, '')) = UPPER(COALESCE(s."Grupo_Comp_letra", ''))
     WHERE s."Cod_Proprietário" = 4255
       AND s."Dt_Saída" IS NOT NULL
       AND s."Hora_Motor_Retorno" IS NULL
       AND s."Dt_Desistencia" IS NULL
       AND s."Dt_Cancela_saida" IS NULL
     ORDER BY s."Dt_Saída" ASC, s."ID" ASC
  `)

  return rs.rows || []
}

function montarMensagemPendencia(r) {
  const agora = agoraBrasil()
  const carimbo = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
  const embGrupo = montarEmbGrupo(r)

  let msg = ''
  msg += `⚠️ *HORA MOTOR PENDENTE*\n`
  msg += `${carimbo} — ${nomeDiaSemana(agora)}\n\n`

  msg += `🚤 *Emb ${embGrupo}*\n`
  msg += `Nome: ${texto(r.nome_embarcacao)}\n`
  if (r.tipo_embarcacao) msg += `Tipo: ${texto(r.tipo_embarcacao)}\n`
  msg += `Grupo WPP: ${texto(r.nome_grupo_wpp)}\n\n`

  msg += `📅 *Agendamento:* ${fmtDataBR(r.dt_agendamento)}\n`
  msg += `🟢 *Data de Saída:* ${fmtDataHoraBR(r.dt_saida)}\n`
  msg += `🔵 *Data de Retorno:* ${fmtDataHoraBR(r.dt_retorno)}\n\n`

  msg += `👤 *Autorizado:* ${texto(r.nome_autorizado)}\n`
  msg += `🆔 Código autorizado: ${texto(r.cod_autorizado)}\n\n`

  msg += `⛽ HM Saída: ${fmtHM(r.hm_saida)}\n`
  msg += `❌ HM Retorno: *PENDENTE*\n\n`

  msg += `🧾 Registro saída ID: ${texto(r.id_saida)}\n`
  msg += `⚙️ Ação: coletar/lançar Hora Motor de Retorno.`

  return msg
}

export async function enviarAlertasHMRetornoPendente(pool, sock, conectado) {
  if (!conectado || !sock) {
    console.log('[HM_PENDENTE] WhatsApp não conectado. Rotina ignorada.')
    return
  }

  if (!GRUPO_ESPELHO_RETORNO_ID) {
    console.warn('[HM_PENDENTE] GRUPO_ESPELHO_RETORNO_ID vazio. Alerta não enviado.')
    return
  }

  try {
    const diaTrabalho = await ehDiaTrabalhoMarina(pool)
    if (!diaTrabalho) {
      console.log('[HM_PENDENTE] Hoje não é dia de trabalho da marina. Rotina ignorada.')
      return
    }

    const pendencias = await buscarPendenciasHMRetorno(pool)

    if (!pendencias.length) {
      console.log('[HM_PENDENTE] Nenhuma pendência de Hora Motor Retorno encontrada.')
      return
    }

    console.log(`[HM_PENDENTE] Enviando ${pendencias.length} pendência(s) para ${GRUPO_ESPELHO_RETORNO_ID}`)

    for (const r of pendencias) {
      const mensagem = montarMensagemPendencia(r)
      await sock.sendMessage(GRUPO_ESPELHO_RETORNO_ID, { text: mensagem })
      console.log(`[HM_PENDENTE] Enviada pendência ID ${r.id_saida} — Emb ${montarEmbGrupo(r)}`)
      await sleep(PAUSA_ENTRE_ENVIOS_MS)
    }
  } catch (err) {
    console.error('[HM_PENDENTE] Erro geral:', err.message)
  }
}

export default enviarAlertasHMRetornoPendente
