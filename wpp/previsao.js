// ============================================================
// wpp/previsao.js — V.2606052005
// Allmax Gestão de Cotas — Marujo⚓
// Previsão de navegação via open-meteo.com
//
// FIX V.2606052005:
// - Removido emoji 🎉 do cabeçalho feliz
// - Nova função: enviarPrevisaoPosAgendamento() para agendamentos do mesmo dia
// ============================================================

const LAT      = '-10.212911'
const LON      = '-48.392500'
const TIMEZONE = 'America/Araguaina'

const HORA_INICIAL = 11
const HORA_FINAL   = 18

const LIM_ATENCAO_CHUVA_PCT = 60
const LIM_ATENCAO_CHUVA_MM  = 1
const LIM_ATENCAO_RAJADA    = 30
const LIM_RUIM_CHUVA_PCT    = 95
const LIM_RUIM_CHUVA_MM     = 10
const LIM_RUIM_RAJADA       = 50

const DIAS_LIMITE = 15

// ============================================================
// HELPERS
// ============================================================

function agoraSP() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}

function dtStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(v, casas) {
  return Number(v || 0).toFixed(casas).replace('.', ',')
}

function nomeDia(d) {
  return ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][d.getDay()]
}

function classificar(prob, mm, rajada) {
  if (prob >= LIM_RUIM_CHUVA_PCT || mm >= LIM_RUIM_CHUVA_MM || rajada >= LIM_RUIM_RAJADA) return 'ruim'
  if (prob >= LIM_ATENCAO_CHUVA_PCT || mm >= LIM_ATENCAO_CHUVA_MM || rajada >= LIM_ATENCAO_RAJADA) return 'atencao'
  return 'bom'
}

function obterMotivo(prob, mm, rajada) {
  const chuva = prob >= LIM_ATENCAO_CHUVA_PCT || mm >= LIM_ATENCAO_CHUVA_MM
  const vento = rajada >= LIM_ATENCAO_RAJADA
  if (chuva && vento) return 'chuva + vento'
  if (chuva) return 'chuva'
  if (vento) return 'vento'
  return 'sem criticidade'
}

function montarBloco(nivel, hIni, hFim, minT, maxT, maxProb, maxMm, maxVento, maxRajada) {
  const iniStr = String(hIni - 1).padStart(2, '0') + ':30h'
  const fimStr = String(hFim).padStart(2, '0') + ':30h'

  let titulo, exibirMotivo
  if (nivel === 'bom') {
    titulo = '🟢 *CONFIÁVEL ----------|*'
    exibirMotivo = false
  } else if (nivel === 'atencao') {
    titulo = '🟡 *ATENÇÃO ------------|*'
    exibirMotivo = true
  } else {
    titulo = '🔴 *CRÍTICA ------------|*'
    exibirMotivo = true
  }

  let linhaProb   = `🌧️ Probabilidade: ${fmt(maxProb, 0)}%`
  let linhaMm     = `💧 Pico: ${fmt(maxMm, 1)} mm/hora`
  let linhaRajada = `💨 Rajada: ${fmt(maxRajada, 0)} km/h`

  if (nivel !== 'bom') {
    if (maxProb   >= LIM_ATENCAO_CHUVA_PCT) linhaProb   = `*${linhaProb}*`
    if (maxMm     >= LIM_ATENCAO_CHUVA_MM)  linhaMm     = `*${linhaMm}*`
    if (maxRajada >= LIM_ATENCAO_RAJADA)    linhaRajada = `*${linhaRajada}*`
  }

  const linhaMotivo = exibirMotivo
    ? `⚠️ Condição: ${obterMotivo(maxProb, maxMm, maxRajada)}\n`
    : ''

  return `${titulo}\n` +
    `⏰ ${iniStr} às ${fimStr}\n` +
    linhaMotivo +
    `${linhaProb}\n` +
    `${linhaMm}\n` +
    `${linhaRajada}\n` +
    `🌡️ Temp.: ${fmt(minT, 1)}°/${fmt(maxT, 1)}°C\n\n`
}

// ============================================================
// PARSER DO COMANDO ppp
// ppp        → hoje
// ppp 05     → próximo dia 05 do calendário
// Retorna { valido, diasAFrente, erro }
// ============================================================
export function parsearComandoPrevisao(texto) {
  const m = /^p{3,}(?:\s+(\d{1,2}))?$/i.exec(String(texto || '').trim())
  if (!m) return { valido: false }

  const agora = agoraSP()
  const hojeMin = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())

  let diasAFrente

  if (!m[1]) {
    diasAFrente = 0
  } else {
    const dia = parseInt(m[1])

    // Próxima ocorrência do dia DD no calendário
    let alvo = new Date(agora.getFullYear(), agora.getMonth(), dia)

    // Se o dia já passou neste mês, vai para o próximo mês
    if (dia < agora.getDate()) {
      alvo = new Date(agora.getFullYear(), agora.getMonth() + 1, dia)
    }

    const alvoMin = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate())
    diasAFrente = Math.round((alvoMin - hojeMin) / 86400000)
  }

  if (diasAFrente > DIAS_LIMITE) {
    const lim = new Date(hojeMin.getTime() + DIAS_LIMITE * 86400000)
    const dd  = String(lim.getDate()).padStart(2, '0')
    const mm  = String(lim.getMonth() + 1).padStart(2, '0')
    return {
      valido: true,
      erro: `⚠️ Data fora do limite. Máximo disponível até ${dd}/${mm}.`
    }
  }

  return { valido: true, diasAFrente }
}

// ============================================================
// BUSCA E MONTA A PREVISÃO
// diasAFrente: 0 = hoje, 1 = amanhã, etc.
// ============================================================
export async function obterPrevisaoNavegacao(diasAFrente = 0, forcarManha = false) {
  const agora = agoraSP()
  const hora  = agora.getHours()
  const base  = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diasAFrente)

  const data   = dtStr(base)
  const dd     = String(base.getDate()).padStart(2, '0')
  const mm     = String(base.getMonth() + 1).padStart(2, '0')
  const diaSem = nomeDia(base)

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,windspeed_10m,windgusts_10m` +
    `&daily=sunset` +
    `&timezone=${TIMEZONE}` +
    `&start_date=${data}&end_date=${data}`

  let json
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    json = await resp.json()
  } catch (err) {
    console.error('[PREVISAO] Erro ao buscar API:', err.message)
    return '⚠️ Não foi possível obter a previsão do tempo. Verifique a conexão e tente novamente.'
  }

  const { hourly, daily } = json
  const times = hourly.time
  const temps = hourly.temperature_2m
  const probs = hourly.precipitation_probability
  const precs = hourly.precipitation
  const winds = hourly.windspeed_10m
  const gusts = hourly.windgusts_10m

  const sunset = (daily.sunset?.[0] || '').slice(11, 16)

  // Cabeçalho "feliz" — somente para hoje, antes do meio-dia
  let resposta = ''
  if ((diasAFrente === 0 && hora < 12) || forcarManha) {
    resposta =
      `*Vamos navegar hoje!!!* 🌊\n` +
      `Aqui é o seu\n` +
      `Assistente Virtual Marujo ⚓\n` +
      `— — — — — — — — — — —\n` +
      `Vou atualizar a previsão do tempo para o nosso lago de Palmas 🗺️\n` +
      `tenha um ótimo dia de recreação 🩴⛱️\n\n`
  }

  resposta += `*PREVISÃO NAVEGAÇÃO* ⚓\n${dd}/${mm} ${diaSem} (meteo.com)\n\n`

  let blocoAtivo = false
  let blocoNivel, hIni, hFim
  let minT, maxT, maxProb, maxMm, maxVento, maxRajada

  for (let i = 0; i < times.length; i++) {
    if (!times[i].startsWith(data)) continue

    const h = parseInt(times[i].slice(11, 13))
    if (h < HORA_INICIAL || h > HORA_FINAL) continue

    const temp   = temps[i] || 0
    const prob   = probs[i] || 0
    const mm2    = precs[i] || 0
    const vento  = winds[i] || 0
    const rajada = gusts[i] || 0

    const nivel = classificar(prob, mm2, rajada)

    if (!blocoAtivo) {
      blocoAtivo = true
      blocoNivel = nivel
      hIni = h; hFim = h
      minT = temp; maxT = temp
      maxProb = prob; maxMm = mm2
      maxVento = vento; maxRajada = rajada
    } else if (nivel === blocoNivel) {
      hFim = h
      if (temp   < minT)     minT     = temp
      if (temp   > maxT)     maxT     = temp
      if (prob   > maxProb)  maxProb  = prob
      if (mm2    > maxMm)    maxMm    = mm2
      if (vento  > maxVento) maxVento = vento
      if (rajada > maxRajada) maxRajada = rajada
    } else {
      resposta += montarBloco(blocoNivel, hIni, hFim, minT, maxT, maxProb, maxMm, maxVento, maxRajada)
      blocoNivel = nivel
      hIni = h; hFim = h
      minT = temp; maxT = temp
      maxProb = prob; maxMm = mm2
      maxVento = vento; maxRajada = rajada
    }
  }

  if (blocoAtivo) {
    resposta += montarBloco(blocoNivel, hIni, hFim, minT, maxT, maxProb, maxMm, maxVento, maxRajada)
  }

  resposta += `🌇 Pôr do sol: ${sunset}h`

  return resposta
}

// ============================================================
// ENVIO AUTOMÁTICO DIÁRIO — 8h
// Chama de server.js no setInterval
// ============================================================

// Cache para evitar envio duplicado no mesmo dia
const gruposEnviados = new Map() // key: "grupowppid-YYYY-MM-DD"

export async function enviarPrevisaoDiaria(pool, sock, conectado) {
  if (!conectado || !sock) return

  try {
    const hoje = dtStr(agoraSP())

    const rs = await pool.query(`
      SELECT DISTINCT g.grupowppid, s."Cod_Emb_PB", s."Grupo_Comp_letra"
        FROM public."P_BOAT_z_10_Saida_Emb" s
        JOIN public.wpp_grupos_agenda g
          ON g.pb = s."Cod_Emb_PB"
         AND UPPER(COALESCE(g.cota, '')) = UPPER(COALESCE(s."Grupo_Comp_letra", ''))
       WHERE DATE(s."Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = $1::date
         AND s."Dt_Desistencia"   IS NULL
         AND s."Dt_Cancela_saida" IS NULL
    `, [hoje])

    if (rs.rowCount === 0) {
      console.log('[PREVISAO] Nenhum grupo com agendamento hoje.')
      return
    }

    console.log(`[PREVISAO] ${rs.rowCount} grupo(s) com agendamento para ${hoje}:`)
    rs.rows.forEach((r, i) => {
      console.log(`  ${i + 1}. PB ${r.Cod_Emb_PB} - Grupo ${r.Grupo_Comp_letra} → ${r.grupowppid}`)
    })

    const previsao = await obterPrevisaoNavegacao(0)

    for (const row of rs.rows) {
      try {
        const chaveCache = `${row.grupowppid}-${hoje}`

        // Verificar se já foi enviado hoje
        if (gruposEnviados.has(chaveCache)) {
          console.log(`[PREVISAO] ⚠️ Pulando ${row.grupowppid} - já enviado hoje às ${gruposEnviados.get(chaveCache)}`)
          continue
        }

        await sock.sendMessage(row.grupowppid, { text: previsao })

        const horaEnvio = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        gruposEnviados.set(chaveCache, horaEnvio)

        console.log(`[PREVISAO] ✅ Enviada para ${row.grupowppid} às ${horaEnvio}`)
        await new Promise(r => setTimeout(r, 2000))
      } catch (err) {
        console.error(`[PREVISAO] ❌ Falha ao enviar para ${row.grupowppid}:`, err.message)
      }
    }

    // Limpar cache de dias anteriores (manter apenas hoje)
    for (const [chave] of gruposEnviados) {
      if (!chave.endsWith(`-${hoje}`)) {
        gruposEnviados.delete(chave)
      }
    }
  } catch (err) {
    console.error('[PREVISAO] Erro geral:', err.message)
  }
}

// ============================================================
// ENVIO APÓS AGENDAMENTO DO MESMO DIA
// Chamado de api/agendar.js quando agendamento é para HOJE
// ============================================================
export async function enviarPrevisaoPosAgendamento(pool, dataAgendamento, grupowppid) {
  try {
    const hoje = dtStr(agoraSP())
    const dataAgendada = String(dataAgendamento || '').slice(0, 10)

    // Só envia se agendamento for para HOJE
    if (dataAgendada !== hoje) {
      console.log('[PREVISAO_POS_AGD] Agendamento não é para hoje, pulando envio')
      return null
    }

    const previsao = await obterPrevisaoNavegacao(0, true) // força cabeçalho feliz

    if (!previsao || previsao.startsWith('⚠️')) {
      console.log('[PREVISAO_POS_AGD] Não foi possível obter previsão')
      return null
    }

    console.log(`[PREVISAO_POS_AGD] Previsão gerada para ${grupowppid}`)
    return previsao

  } catch (err) {
    console.error('[PREVISAO_POS_AGD] Erro:', err.message)
    return null
  }
}
