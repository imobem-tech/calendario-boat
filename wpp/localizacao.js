// ============================================================
// wpp/localizacao.js — V.2606021250
// Allmax Gestão de Cotas — Marujo⚓
// Localização em tempo real → Tracking + Ranking dinâmico
// NOTA: Retorno (Dt_Retorno) é registrado SOMENTE via comando rrr
// ============================================================

import { buscarGrupoInfo } from './db.js'

const VERSAO_LOCALIZACAO = 'V.2606022239'

// ============================================================
// CONFIGURAÇÃO DO PORTO E GRUPO ESPELHO
// ============================================================
const PORTO = {
  latitude: -10.21101,     // Marina Palmas-TO
  longitude: -48.36912     // Marina Palmas-TO
}

const GRUPO_ESPELHO_RETORNO_ID = '120363426928542914@g.us'

// ============================================================
// CALCULAR DISTÂNCIA ENTRE DOIS PONTOS (Haversine)
// ============================================================
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // raio da Terra em metros
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c) // metros
}

// ============================================================
// GRAVAR POSIÇÃO NO BANCO
// ============================================================
async function gravarPosicao(pool, agendamentoId, pb, cota, latitude, longitude, distanciaPorto) {
  await pool.query(
    `INSERT INTO public.wpp_localizacao_emb
      (agendamento_id, pb, cota, latitude, longitude, distancia_porto_m)
    VALUES ($1, $2, $3, $4, $5, $6)`,
    [agendamentoId, pb, cota, latitude, longitude, distanciaPorto]
  )
}

// ============================================================
// BUSCAR RANKING ATUAL (TODOS COM SAÍDA ABERTA HOJE)
// ============================================================
async function buscarRankingAtual(pool) {
  const rs = await pool.query(`
    WITH saidas_hoje AS (
      SELECT
        s."ID" as agendamento_id,
        s."Cod_Emb_PB" as pb,
        s."Grupo_Comp_letra" as cota,
        s."Cod_Autorizado" as cod_autorizado,
        e."Nome_Embar" as nome_embarcacao,
        e."Marca" as marca_embarcacao,
        e."Tipo_Embar" as tipo_embarcacao,
        g.grupowppid as grupo_id
      FROM public."P_BOAT_z_10_Saida_Emb" s
      LEFT JOIN public."P_BOAT_1_Embarcacao" e
        ON e."Num_PB" = s."Cod_Emb_PB"
      LEFT JOIN public.wpp_grupos_agenda g
        ON g.pb = s."Cod_Emb_PB"
        AND UPPER(COALESCE(g.cota, '')) = UPPER(COALESCE(s."Grupo_Comp_letra", ''))
      WHERE DATE(s."Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') =
            (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
        AND s."Dt_Saída" IS NOT NULL
        AND s."Dt_Retorno" IS NULL
        AND s."Dt_Desistencia" IS NULL
        AND s."Dt_Cancela_saida" IS NULL
    ),
    ultimas_posicoes AS (
      SELECT DISTINCT ON (agendamento_id)
        agendamento_id,
        latitude,
        longitude,
        distancia_porto_m,
        criado_em
      FROM public.wpp_localizacao_emb
      WHERE agendamento_id IN (SELECT agendamento_id FROM saidas_hoje)
      ORDER BY agendamento_id, criado_em DESC
    ),
    penultimas_posicoes AS (
      SELECT DISTINCT ON (agendamento_id)
        agendamento_id,
        latitude as latitude_anterior,
        longitude as longitude_anterior,
        distancia_porto_m as distancia_anterior,
        criado_em as criado_em_anterior
      FROM public.wpp_localizacao_emb
      WHERE agendamento_id IN (SELECT agendamento_id FROM saidas_hoje)
        AND criado_em < (
          SELECT MAX(criado_em)
          FROM public.wpp_localizacao_emb l2
          WHERE l2.agendamento_id = wpp_localizacao_emb.agendamento_id
        )
      ORDER BY agendamento_id, criado_em DESC
    )
    SELECT
      s.*,
      p.latitude,
      p.longitude,
      p.distancia_porto_m,
      p.criado_em as ultima_atualizacao,
      pp.latitude_anterior,
      pp.longitude_anterior,
      pp.distancia_anterior,
      pp.criado_em_anterior
    FROM saidas_hoje s
    LEFT JOIN ultimas_posicoes p ON p.agendamento_id = s.agendamento_id
    LEFT JOIN penultimas_posicoes pp ON pp.agendamento_id = s.agendamento_id
    ORDER BY
      CASE WHEN p.distancia_porto_m IS NULL THEN 1 ELSE 0 END,
      p.distancia_porto_m ASC
  `)

  return rs.rows
}

// ============================================================
// TRUNCAR TEXTO PARA MÁXIMO DE CARACTERES
// ============================================================
function truncar(texto, maxCaracteres) {
  if (!texto) return ''
  return texto.length > maxCaracteres
    ? texto.substring(0, maxCaracteres - 1) + '…'
    : texto
}

// ============================================================
// FORMATAR DISTÂNCIA
// ============================================================
function formatarDistancia(metros) {
  if (metros < 1000) {
    return `${String(metros).padStart(4, '0')}m`
  }
  return `${(metros / 1000).toFixed(1)}km`
}

// ============================================================
// EMOJI POR DISTÂNCIA (INVERTIDO: vermelho = perto)
// ============================================================
function emojiPorDistancia(metros) {
  if (metros === null) return '⚪'
  if (metros <= 300) return '🔴' // Vermelho = PERTO
  if (metros <= 1000) return '🟡' // Amarelo = MÉDIO
  return '🟢' // Verde = LONGE
}

// ============================================================
// CALCULAR VELOCIDADE E ETA
// ============================================================
function calcularVelocidadeETA(item) {
  // Se não tem posição anterior, não pode calcular velocidade
  if (!item.latitude_anterior || !item.latitude || item.distancia_porto_m === null) {
    return { velocidadeKmh: 0, etaMinutos: 0 }
  }

  // Calcular tempo decorrido entre posições (em segundos)
  const tempoMs = new Date(item.ultima_atualizacao) - new Date(item.criado_em_anterior)
  const tempoSeg = tempoMs / 1000

  // Se muito pouco tempo, não calcular (evitar divisão por zero)
  if (tempoSeg < 5) {
    return { velocidadeKmh: 0, etaMinutos: 0 }
  }

  // Calcular distância percorrida entre as duas posições (fórmula de Haversine)
  const R = 6371e3 // Raio da Terra em metros
  const φ1 = item.latitude_anterior * Math.PI / 180
  const φ2 = item.latitude * Math.PI / 180
  const Δφ = (item.latitude - item.latitude_anterior) * Math.PI / 180
  const Δλ = (item.longitude - item.longitude_anterior) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distanciaPercorridaMetros = R * c

  // Calcular velocidade em km/h
  const velocidadeMs = distanciaPercorridaMetros / tempoSeg
  const velocidadeKmh = Math.round(velocidadeMs * 3.6)

  // Calcular ETA (tempo estimado de chegada a 100m da marina)
  let etaMinutos = 0
  if (velocidadeKmh > 0) {
    // Distância que falta para chegar a 100m
    const distanciaRestante = Math.max(0, item.distancia_porto_m - 100)

    // Tempo em horas
    const tempoHoras = distanciaRestante / 1000 / velocidadeKmh

    // Converter para minutos
    etaMinutos = Math.round(tempoHoras * 60)
  }

  return {
    velocidadeKmh: Math.max(0, velocidadeKmh),
    etaMinutos: Math.max(0, etaMinutos)
  }
}

// ============================================================
// MONTAR MENSAGEM DE RANKING SINTÉTICA (GRUPOS)
// ============================================================
function montarMensagemRankingSintetica(ranking, pbFiltro, cotaFiltro) {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`

  let msg = `*🏁 RETORNO — ${hora}*\n\n`

  // Separar barcos com e sem localização
  const comLoc = ranking.filter(i => i.distancia_porto_m !== null)
  const semLoc = ranking.filter(i => i.distancia_porto_m === null)

  if (comLoc.length === 0 && semLoc.length === 0) {
    msg += `ℹ️ Nenhuma embarcação\nem retorno.\n\n`
  } else {
    let meuETA = null

    // Barcos com localização
    comLoc.forEach((item, index) => {
      const posicao = index + 1
      const emoji = emojiPorDistancia(item.distancia_porto_m)
      const ehMeuBarco = (pbFiltro && item.pb == pbFiltro && (item.cota || '') == (cotaFiltro || ''))
      const emb = ehMeuBarco ? `*${item.pb}-${item.cota || '?'}*` : `${item.pb}-${item.cota || '?'}`

      // Calcular velocidade e ETA
      const { velocidadeKmh, etaMinutos } = calcularVelocidadeETA(item)

      // Calcular horário de chegada
      const horaChegada = new Date(agora.getTime() + etaMinutos * 60000)
      const hhMM = `${String(horaChegada.getHours()).padStart(2, '0')}:${String(horaChegada.getMinutes()).padStart(2, '0')}`

      if (ehMeuBarco) {
        meuETA = hhMM
      }

      // Formato: 0120m 022km/h 20:45
      const distMetros = String(item.distancia_porto_m).padStart(4, '0') + 'm'
      const velKmh = String(velocidadeKmh).padStart(3, '0') + 'km/h'

      msg += `${posicao}º ${emoji} ${emb}\n`
      msg += `${distMetros} ${velKmh} ${hhMM}\n`
      msg += `--------------------\n`
    })

    // Barcos sem localização (no final)
    semLoc.forEach((item, index) => {
      const posicao = comLoc.length + index + 1
      const emoji = emojiPorDistancia(null)
      const ehMeuBarco = (pbFiltro && item.pb == pbFiltro && (item.cota || '') == (cotaFiltro || ''))
      const emb = ehMeuBarco ? `*${item.pb}-${item.cota || '?'}*` : `${item.pb}-${item.cota || '?'}`

      msg += `${posicao}º ${emoji} ${emb}\n`
      msg += `xxxx xxxx --:--\n`
      msg += `--------------------\n`
    })

    // Prob_ apenas do próprio barco
    if (meuETA) {
      msg += `\nProb_${meuETA}\n`
    }

    msg += `\n`
  }

  msg += `🔴 até 300m | 🟡 até 1km\n`
  msg += `🟢 > 1km | ⚪ sem localização\n\n`
  msg += `📍 Compartilhe localização em\n`
  msg += `tempo real para atualizar\n\n`
  msg += `🗺️ Ver mapa ao vivo:\n`
  msg += `https://calendario-boat-production.up.railway.app/rastrear.html\n\n`
  msg += `${VERSAO_LOCALIZACAO}`

  return msg
}

// ============================================================
// MONTAR MENSAGEM DE RANKING COMPLETA (ESPELHO)
// ============================================================
function montarMensagemRankingCompleta(ranking) {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`

  let msg = `*🏁 RANKING DE RETORNO — ${hora}*\n\n`

  // Separar com e sem localização
  const comLoc = ranking.filter(i => i.distancia_porto_m !== null)
  const semLoc = ranking.filter(i => i.distancia_porto_m === null)

  if (comLoc.length === 0 && semLoc.length === 0) {
    msg += `ℹ️ Nenhuma embarcação em\nprocesso de retorno no momento.\n\n`
  } else {
    // Com localização
    comLoc.forEach((item, index) => {
      const posicao = index + 1
      const emoji = emojiPorDistancia(item.distancia_porto_m)
      const emb = `*${item.pb}-${item.cota || '?'}*`
      const nomeEmb = item.nome_embarcacao || 'Embarcação'

      // Marca + Modelo
      let marcaModelo = ''
      if (item.marca_embarcacao && item.tipo_embarcacao) {
        marcaModelo = `${item.marca_embarcacao} ${item.tipo_embarcacao}`
      } else if (item.tipo_embarcacao) {
        marcaModelo = item.tipo_embarcacao
      } else if (item.marca_embarcacao) {
        marcaModelo = item.marca_embarcacao
      } else {
        marcaModelo = 'Sem informação'
      }
      marcaModelo = truncar(marcaModelo, 25)

      // Calcular velocidade e ETA
      const { velocidadeKmh, etaMinutos } = calcularVelocidadeETA(item)
      const horaChegada = new Date(agora.getTime() + etaMinutos * 60000)
      const hhMM = `${String(horaChegada.getHours()).padStart(2, '0')}:${String(horaChegada.getMinutes()).padStart(2, '0')}`

      const distMetros = String(item.distancia_porto_m).padStart(4, '0') + 'm'
      const velKmh = String(velocidadeKmh).padStart(3, '0') + 'km/h'

      msg += `${posicao}º ${emoji} ${emb} ${nomeEmb}\n`
      msg += `${distMetros} ${marcaModelo}\n`
      msg += `Prob_${hhMM}\n`
      msg += `${distMetros} ${velKmh} ${hhMM}\n`
      msg += `-------------------------\n`
    })

    // Sem localização (final)
    semLoc.forEach((item, index) => {
      const posicao = comLoc.length + index + 1
      const emoji = emojiPorDistancia(null)
      const emb = `*${item.pb}-${item.cota || '?'}*`
      const nomeEmb = item.nome_embarcacao || 'Embarcação'

      msg += `${posicao}º ${emoji} ${emb} ${nomeEmb}\n`
      msg += `Sem localização\n`
      msg += `Prob_--:--\n`
      msg += `xxxx xxxx --:--\n`
      msg += `-------------------------\n`
    })
  }

  msg += `\n🔴 até 300m | 🟡 até 1km\n`
  msg += `🟢 > 1km | ⚪ sem localização\n\n`
  msg += `📍 Compartilhe localização em\n`
  msg += `tempo real para atualizar\n\n`
  msg += `🗺️ Ver mapa ao vivo:\n`
  msg += `https://calendario-boat-production.up.railway.app/rastrear.html\n\n`
  msg += `${VERSAO_LOCALIZACAO}`

  return msg
}


// ============================================================
// EDITAR/ENVIAR MENSAGEM DE RANKING EM TODOS OS GRUPOS
// Renova mensagem a cada 12min (antes do limite de 15min do WhatsApp)
// ============================================================
async function atualizarRankingEmTodosGrupos(sock, pool, ranking) {
  const TEMPO_RENOVACAO_MS = 14 * 60 * 1000 // 14 minutos (limite seguro antes dos 15min do WhatsApp)

  // Grupos que devem receber: todos com localização enviada + espelho
  const gruposDestino = new Map() // Usar Map para guardar pb e cota de cada grupo
  gruposDestino.set(GRUPO_ESPELHO_RETORNO_ID, { pb: null, cota: null }) // Espelho sem filtro

  ranking.forEach(item => {
    if (item.grupo_id && item.latitude) {
      gruposDestino.set(item.grupo_id, { pb: item.pb, cota: item.cota })
    }
  })

  for (const [grupoId, dadosGrupo] of gruposDestino) {
    try {
      // Determinar se é grupo espelho ou grupo de embarcação
      const isGrupoEspelho = grupoId === GRUPO_ESPELHO_RETORNO_ID

      // Montar mensagem apropriada
      let mensagemRanking = isGrupoEspelho
        ? montarMensagemRankingCompleta(ranking)
        : montarMensagemRankingSintetica(ranking, dadosGrupo.pb, dadosGrupo.cota)

      // Se tem pb/cota (não é espelho), adicionar parâmetros no link
      if (dadosGrupo.pb) {
        const urlBase = 'https://calendario-boat-production.up.railway.app/rastrear.html'
        const urlPersonalizada = `${urlBase}?pb=${dadosGrupo.pb}&cota=${dadosGrupo.cota || ''}`
        mensagemRanking = mensagemRanking.replace(
          'https://calendario-boat-production.up.railway.app/rastrear.html',
          urlPersonalizada
        )
      }

      // Buscar messageKey e tempo desde última renovação
      const rsMsg = await pool.query(
        `SELECT message_key,
                EXTRACT(EPOCH FROM (NOW() - atualizado_em)) * 1000 as ms_desde_atualizacao
         FROM public.wpp_ranking_msg
         WHERE grupo_id = $1`,
        [grupoId]
      )

      let precisaRenovar = false
      let messageKey = null

      if (rsMsg.rowCount > 0) {
        const msSinceUpdate = parseFloat(rsMsg.rows[0].ms_desde_atualizacao) || 0
        messageKey = rsMsg.rows[0].message_key
        precisaRenovar = msSinceUpdate >= TEMPO_RENOVACAO_MS

        console.log(`[DEBUG] Grupo ${grupoId}: ${Math.round(msSinceUpdate / 60000)}min desde última msg | Precisa renovar: ${precisaRenovar}`)
      } else {
        console.log(`[DEBUG] Grupo ${grupoId}: Sem registro no banco, criando primeira mensagem`)
      }

      if (precisaRenovar || !messageKey) {
        // RENOVAÇÃO: Editar antiga para "atualizaremos..." + Criar nova
        if (precisaRenovar && messageKey) {
          try {
            const keyParaEditar = typeof messageKey === 'string' ? JSON.parse(messageKey) : messageKey

            // Mensagem elegante de transição
            const msgTransicao = `⏳ *Atualizaremos o ranking...*`

            await sock.sendMessage(grupoId, {
              text: msgTransicao,
              edit: keyParaEditar
            })
            console.log(`✏️ Mensagem antiga editada para transição no grupo ${grupoId}`)
          } catch (errEdit) {
            console.warn(`⚠️ Não conseguiu editar para transição: ${errEdit.message}`)
          }
        }

        // Criar nova mensagem atualizada
        const sentMsg = await sock.sendMessage(grupoId, { text: mensagemRanking })

        // Salvar nova messageKey com timestamp de renovação
        await pool.query(
          `INSERT INTO public.wpp_ranking_msg (grupo_id, message_key, atualizado_em)
           VALUES ($1, $2, NOW())
           ON CONFLICT (grupo_id) DO UPDATE SET message_key = $2, atualizado_em = NOW()`,
          [grupoId, JSON.stringify(sentMsg.key)]
        )

        if (precisaRenovar) {
          console.log(`🔄 Ranking RENOVADO no grupo ${grupoId} (14min expirados - editou transição + criou nova)`)
        } else {
          console.log(`📤 Ranking CRIADO no grupo ${grupoId}`)
        }
      } else {
        // Editar mensagem existente (0-14 minutos)
        try {
          // messageKey já vem como objeto do JSONB, não precisa parse
          const keyParaEditar = typeof messageKey === 'string' ? JSON.parse(messageKey) : messageKey

          await sock.sendMessage(grupoId, {
            text: mensagemRanking,
            edit: keyParaEditar
          })

          // IMPORTANTE: NÃO atualizar timestamp ao editar
          // O timestamp só muda quando RENOVAMOS (nova mensagem)
          // Edição não conta como renovação

          console.log(`📝 Ranking editado no grupo ${grupoId}`)
        } catch (errEdit) {
          // Se falhar edição, edita para transição e cria nova (renovação forçada)
          console.warn(`⚠️ Falha ao editar, forçando renovação: ${errEdit.message}`)

          try {
            const keyParaEditar = typeof messageKey === 'string' ? JSON.parse(messageKey) : messageKey
            await sock.sendMessage(grupoId, {
              text: `⏳ *Atualizaremos o ranking...*`,
              edit: keyParaEditar
            })
          } catch (errEdit2) {
            console.warn(`   ⚠️ Não conseguiu editar para transição: ${errEdit2.message}`)
          }

          const sentMsg = await sock.sendMessage(grupoId, { text: mensagemRanking })

          await pool.query(
            `UPDATE public.wpp_ranking_msg
             SET message_key = $1, atualizado_em = NOW()
             WHERE grupo_id = $2`,
            [JSON.stringify(sentMsg.key), grupoId]
          )
        }
      }
    } catch (err) {
      console.error(`❌ Erro ao atualizar ranking no grupo ${grupoId}:`, err.message)
    }
  }
}

// ============================================================
// HANDLER PRINCIPAL DE LOCALIZAÇÃO
// ============================================================
export async function handleLocalizacao(sock, pool, grupoId, msg) {
  const locMsg = msg.message?.locationMessage || msg.message?.liveLocationMessage
  if (!locMsg) return false // Não é mensagem de localização

  const isLive = !!msg.message?.liveLocationMessage
  const latitude = locMsg.degreesLatitude
  const longitude = locMsg.degreesLongitude

  if (!latitude || !longitude) {
    console.warn('⚠️ Localização sem coordenadas válidas')
    return true // Consumiu a mensagem mas não processou
  }

  console.log(`📍 Localização recebida — Grupo: ${grupoId} — Live: ${isLive} — Lat: ${latitude}, Lon: ${longitude}`)

  try {
    // Buscar info do grupo
    const grupoInfo = await buscarGrupoInfo(pool, grupoId)
    if (!grupoInfo) {
      console.log(`⚠️ Grupo ${grupoId} não encontrado no cadastro`)
      return true
    }

    const { pb, cota } = grupoInfo

    // Buscar agendamento aberto do dia
    const rsAg = await pool.query(
      `SELECT "ID", "Dt_Saída", "Dt_Retorno", "Cod_Autorizado", "Grupo_Comp_letra"
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND COALESCE("Grupo_Comp_letra", '') = COALESCE($2, '')
          AND DATE("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
          AND "Dt_Saída" IS NOT NULL
          AND "Dt_Retorno" IS NULL
          AND "Dt_Desistencia" IS NULL
          AND "Dt_Cancela_saida" IS NULL
        LIMIT 1`,
      [pb, cota || '']
    )

    if (rsAg.rowCount === 0) {
      console.log(`⚠️ Nenhum agendamento aberto hoje para ${pb}-${cota}`)

      // Enviar mensagem de erro no grupo
      const msgErro = `❌ *LOCALIZAÇÃO RECUSADA*

🚤 ${pb}-${cota || '?'}

Não há saída pendente de retorno.

Verifique:
• Saída registrada hoje?
• Retorno já confirmado?

${VERSAO_LOCALIZACAO}`

      await sock.sendMessage(grupoId, { text: msgErro }).catch(err => {
        console.error('Erro ao enviar mensagem de recusa:', err)
      })

      return true
    }

    const agendamento = rsAg.rows[0]
    const agendamentoId = agendamento.ID

    // Calcular distância do porto
    const distanciaPorto = calcularDistancia(
      latitude,
      longitude,
      PORTO.latitude,
      PORTO.longitude
    )

    console.log(`📏 Distância do porto: ${distanciaPorto}m`)

    // Gravar posição no banco
    await gravarPosicao(pool, agendamentoId, pb, cota, latitude, longitude, distanciaPorto)

    // ============================================================
    // REGISTRAR RETORNO AUTOMÁTICO SE CHEGOU NO PIER
    // ============================================================
    const RAIO_CHEGADA_METROS = 50 // 50 metros da marina

    if (distanciaPorto <= RAIO_CHEGADA_METROS && !agendamento['Dt_Retorno']) {
      // Chegou no pier - registrar retorno automático
      const agoraRetorno = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

      await pool.query(
        `UPDATE public."P_BOAT_z_10_Saida_Emb"
            SET "Dt_Retorno" = $1
          WHERE "ID" = $2`,
        [agoraRetorno, agendamentoId]
      )

      console.log(`✅ Retorno VIA GEO registrado — agendamento ${agendamentoId} — Emb ${pb}-${cota}`)

      // Enviar mensagem de confirmação VIA GEO no grupo
      const dd = String(agoraRetorno.getDate()).padStart(2, '0')
      const mm = String(agoraRetorno.getMonth() + 1).padStart(2, '0')
      const hh = String(agoraRetorno.getHours()).padStart(2, '0')
      const min = String(agoraRetorno.getMinutes()).padStart(2, '0')

      const sufixo = `${dd}${hh}${min}`
      const dataHora = `${dd}/${mm} ${hh}:${min}`

      const msgRetornoGeo =
`\`\`\`Olá, sou o seu
Assistente Virtual\`\`\` *Marujo⚓*
\`\`\`--------------------------\`\`\`

✅ *RETORNO_${sufixo} VIA GEO*
${dataHora}
Emb ${pb}-${cota}

🌍 Localização detectada
no raio do pier (${distanciaPorto}m)

Retorno registrado
automaticamente.

${VERSAO_LOCALIZACAO}`

      await sock.sendMessage(grupoId, { text: msgRetornoGeo })
    }

    // Buscar ranking atualizado
    const ranking = await buscarRankingAtual(pool)

    // Atualizar mensagem de ranking em todos os grupos
    await atualizarRankingEmTodosGrupos(sock, pool, ranking)

  } catch (err) {
    console.error('❌ Erro ao processar localização:', err.message)
    console.error(err.stack)
  }

  return true // Mensagem consumida
}

// ============================================================
// VERIFICAR POSIÇÕES EXPIRADAS (ROTINA AUTOMÁTICA A CADA 1 MIN)
// ============================================================
export async function verificarPosicoesExpiradas(sock, pool) {
  const TEMPO_EXPIRACAO_MS = 30 * 60 * 1000 // 30 minutos
  const JANELA_AVISO_MS = 2 * 60 * 1000 // 2 minutos de janela para avisar

  try {
    // Buscar todos com posição recente (em processo de retorno)
    const rsAtivos = await pool.query(`
      WITH ultimas_posicoes AS (
        SELECT DISTINCT ON (agendamento_id)
          l.agendamento_id,
          l.pb,
          l.cota,
          l.criado_em,
          g.grupowppid,
          e."Nome_Embar" as nome_embarcacao,
          EXTRACT(EPOCH FROM (NOW() - l.criado_em)) * 1000 as ms_desde_ultima_posicao
        FROM public.wpp_localizacao_emb l
        LEFT JOIN public.wpp_grupos_agenda g
          ON g.pb = l.pb
          AND UPPER(COALESCE(g.cota, '')) = UPPER(COALESCE(l.cota, ''))
        LEFT JOIN public."P_BOAT_1_Embarcacao" e
          ON e."Num_PB" = l.pb
        WHERE l.agendamento_id IN (
          SELECT s."ID"
          FROM public."P_BOAT_z_10_Saida_Emb" s
          WHERE DATE(s."Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') =
                (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
            AND s."Dt_Saída" IS NOT NULL
            AND s."Dt_Retorno" IS NULL
            AND s."Dt_Desistencia" IS NULL
            AND s."Dt_Cancela_saida" IS NULL
        )
        ORDER BY agendamento_id, l.criado_em DESC
      )
      SELECT *
      FROM ultimas_posicoes
      WHERE ms_desde_ultima_posicao >= $1
    `, [TEMPO_EXPIRACAO_MS])

    if (rsAtivos.rowCount === 0) {
      // Ninguém expirado
      return { temFilaAtiva: true, expirados: 0 }
    }

    console.log(`⏰ [EXPIRAÇÃO] ${rsAtivos.rowCount} embarcação(ões) com localização expirada`)

    // Para cada expirado: avisar no grupo específico APENAS SE RECÉM-EXPIROU
    for (const exp of rsAtivos.rows) {
      if (!exp.grupowppid) continue

      const msDesdePosicao = parseFloat(exp.ms_desde_ultima_posicao)
      const recemExpirou = msDesdePosicao >= TEMPO_EXPIRACAO_MS &&
                          msDesdePosicao < (TEMPO_EXPIRACAO_MS + JANELA_AVISO_MS)

      // Só avisa se acabou de expirar (entre 30 e 32 minutos)
      if (recemExpirou) {
        const embId = `${exp.pb}-${exp.cota || '?'}`
        const nomeEmb = exp.nome_embarcacao || 'Embarcação'
        const minutosAtras = Math.round(msDesdePosicao / 60000)

        const msgExpiracao = `
⚠️ *LOCALIZAÇÃO EXPIRADA*

🚤 ${embId} ${nomeEmb}

Sua localização em tempo real
parou de ser compartilhada.

⏰ Última posição: há ${minutosAtras} min

Você saiu do *Ranking de Retorno*.

📍 *Renove a localização atual
para reabrir a entrada na marina.*

${VERSAO_LOCALIZACAO}`

        try {
          await sock.sendMessage(exp.grupowppid, { text: msgExpiracao })
          console.log(`   📤 Aviso enviado para grupo ${exp.grupowppid} (recém-expirado)`)
        } catch (err) {
          console.error(`   ❌ Erro ao enviar aviso para ${exp.grupowppid}:`, err.message)
        }
      } else {
        console.log(`   ⏭️ Grupo ${exp.grupowppid} já foi avisado (${Math.round(msDesdePosicao / 60000)} min)`)
      }
    }

    // Buscar ranking atualizado (sem os expirados)
    const ranking = await buscarRankingAtual(pool)

    // Atualizar ranking em todos os grupos
    await atualizarRankingEmTodosGrupos(sock, pool, ranking)

    console.log(`✅ [EXPIRAÇÃO] Ranking atualizado em todos os grupos (${rsAtivos.rowCount} removidos)`)

    // Verificar se ainda tem fila ativa
    const rsVerificaFila = await pool.query(`
      SELECT COUNT(*) as total
      FROM (
        SELECT DISTINCT ON (agendamento_id)
          agendamento_id,
          criado_em
        FROM public.wpp_localizacao_emb
        WHERE agendamento_id IN (
          SELECT s."ID"
          FROM public."P_BOAT_z_10_Saida_Emb" s
          WHERE DATE(s."Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') =
                (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
            AND s."Dt_Saída" IS NOT NULL
            AND s."Dt_Retorno" IS NULL
            AND s."Dt_Desistencia" IS NULL
            AND s."Dt_Cancela_saida" IS NULL
        )
        ORDER BY agendamento_id, criado_em DESC
      ) ultimas
      WHERE EXTRACT(EPOCH FROM (NOW() - criado_em)) * 1000 < $1
    `, [TEMPO_EXPIRACAO_MS])

    const filaAtiva = parseInt(rsVerificaFila.rows[0]?.total || 0) > 0

    return { temFilaAtiva: filaAtiva, expirados: rsAtivos.rowCount }

  } catch (err) {
    console.error('❌ [EXPIRAÇÃO] Erro ao verificar posições:', err.message)
    return { temFilaAtiva: true, expirados: 0 } // Assume ativo em caso de erro
  }
}

// ============================================================
// V.2606021250
// ============================================================
