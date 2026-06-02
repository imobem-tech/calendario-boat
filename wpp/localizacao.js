// ============================================================
// wpp/localizacao.js — V.2606021250
// Allmax Gestão de Cotas — Marujo⚓
// Localização em tempo real → Tracking + Ranking dinâmico
// NOTA: Retorno (Dt_Retorno) é registrado SOMENTE via comando rrr
// ============================================================

import { buscarGrupoInfo } from './db.js'

const VERSAO_LOCALIZACAO = 'V.2606021250'

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
    )
    SELECT
      s.*,
      p.latitude,
      p.longitude,
      p.distancia_porto_m,
      p.criado_em as ultima_atualizacao
    FROM saidas_hoje s
    LEFT JOIN ultimas_posicoes p ON p.agendamento_id = s.agendamento_id
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
// EMOJI POR DISTÂNCIA
// ============================================================
function emojiPorDistancia(metros) {
  if (metros === null) return '⚪'
  if (metros <= 300) return '🟢'
  if (metros <= 1000) return '🟡'
  return '🔴'
}

// ============================================================
// MONTAR MENSAGEM DE RANKING
// ============================================================
function montarMensagemRanking(ranking) {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`

  let msg = `*🏁 RANKING DE RETORNO — ${hora}*\n\n`

  if (ranking.length === 0) {
    msg += `ℹ️ Nenhuma embarcação em\nprocesso de retorno no momento.\n\n`
  } else {
    ranking.forEach((item, index) => {
      const posicao = index + 1
      const emoji = emojiPorDistancia(item.distancia_porto_m)
      const emb = `*${item.pb}-${item.cota || '?'}*`
      const nomeEmb = item.nome_embarcacao || 'Embarcação'

      // Marca + Modelo truncado para 25 caracteres
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

      const dist = item.distancia_porto_m !== null
        ? formatarDistancia(item.distancia_porto_m)
        : 'S/LOC'

      const descDist = item.distancia_porto_m !== null
        ? truncar(marcaModelo, 25)
        : 'Sem localização'

      msg += `${posicao}º ${emoji} ${emb} ${nomeEmb}\n`
      msg += `${dist} ${descDist}\n`
      msg += `-------------------------\n\n`
    })
  }

  msg += `🟢 até 300m | 🟡 até 1km\n`
  msg += `🔴 > 1km | ⚪ sem localização\n\n`
  msg += `📍 Compartilhe localização em\n`
  msg += `tempo real para atualizar\n\n`
  msg += `🗺️ Ver mapa ao vivo:\n`
  msg += `https://allmaxcalendar.vercel.app/rastrear\n\n`
  msg += `${VERSAO_LOCALIZACAO}`

  return msg
}

// ============================================================
// EDITAR/ENVIAR MENSAGEM DE RANKING EM TODOS OS GRUPOS
// Renova mensagem a cada 12min (antes do limite de 15min do WhatsApp)
// ============================================================
async function atualizarRankingEmTodosGrupos(sock, pool, ranking) {
  const mensagemRanking = montarMensagemRanking(ranking)
  const TEMPO_RENOVACAO_MS = 12 * 60 * 1000 // 12 minutos

  // Grupos que devem receber: todos com localização enviada + espelho
  const gruposDestino = new Set([GRUPO_ESPELHO_RETORNO_ID])
  ranking.forEach(item => {
    if (item.grupo_id && item.latitude) {
      gruposDestino.add(item.grupo_id)
    }
  })

  for (const grupoId of gruposDestino) {
    try {
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
      }

      if (precisaRenovar || !messageKey) {
        // Enviar nova mensagem (renovação ou primeira vez)
        const sentMsg = await sock.sendMessage(grupoId, { text: mensagemRanking })

        // Salvar nova messageKey com timestamp de renovação
        await pool.query(
          `INSERT INTO public.wpp_ranking_msg (grupo_id, message_key, atualizado_em)
           VALUES ($1, $2, NOW())
           ON CONFLICT (grupo_id) DO UPDATE SET message_key = $2, atualizado_em = NOW()`,
          [grupoId, JSON.stringify(sentMsg.key)]
        )

        if (precisaRenovar) {
          console.log(`🔄 Ranking RENOVADO no grupo ${grupoId} (12min expirados)`)
        } else {
          console.log(`📤 Ranking CRIADO no grupo ${grupoId}`)
        }
      } else {
        // Editar mensagem existente
        try {
          await sock.sendMessage(grupoId, {
            text: mensagemRanking,
            edit: JSON.parse(messageKey)
          })
          console.log(`📝 Ranking editado no grupo ${grupoId}`)
        } catch (errEdit) {
          // Se falhar edição, cria nova
          console.warn(`⚠️ Falha ao editar ranking, criando nova: ${errEdit.message}`)
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
// V.2606021250
// ============================================================
