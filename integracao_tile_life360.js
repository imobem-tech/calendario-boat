// ============================================================
// Integração Tile Life360 → PostgreSQL → WhatsApp
// V.2606041600
// Sistema de Rastreamento de Embarcações
// ============================================================

import pkg from 'pg'
import fetch from 'node-fetch'

const { Pool } = pkg

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

// Credenciais Life360 (variáveis de ambiente)
const LIFE360_EMAIL = process.env.LIFE360_EMAIL
const LIFE360_PASSWORD = process.env.LIFE360_PASSWORD

// Coordenadas da marina
const LAT_MARINA = -10.212911
const LON_MARINA = -48.392500
const RAIO_70M = 70 // metros

// ============================================================
// LIFE360 API (não-oficial)
// ============================================================

let life360Token = null
let life360CircleId = null

/**
 * Login no Life360 e obter token de acesso
 */
async function loginLife360() {
  try {
    console.log('🔐 Fazendo login no Life360...')

    const response = await fetch('https://api-cloudfront.life360.com/v3/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic cFJFcXVnYWJSZXRyZTRFc3RldGhlcnVmcmVQdW1hbUV4dWNyRUh1YzptM2ZydXBSZXRSZXN3ZXJFQ2hBUHJFOTZxYWtFZHI0Vg=='
      },
      body: new URLSearchParams({
        'grant_type': 'password',
        'username': LIFE360_EMAIL,
        'password': LIFE360_PASSWORD
      })
    })

    if (!response.ok) {
      throw new Error(`Login falhou: ${response.status}`)
    }

    const data = await response.json()
    life360Token = data.access_token

    console.log('✅ Login Life360 bem-sucedido')
    return life360Token

  } catch (erro) {
    console.error('❌ Erro no login Life360:', erro.message)
    throw erro
  }
}

/**
 * Buscar círculo (família) no Life360
 */
async function getLife360Circle() {
  try {
    if (!life360Token) await loginLife360()

    const response = await fetch('https://api-cloudfront.life360.com/v3/circles', {
      headers: {
        'Authorization': `Bearer ${life360Token}`
      }
    })

    if (!response.ok) {
      // Token expirado? Tentar login novamente
      if (response.status === 401) {
        await loginLife360()
        return getLife360Circle() // Retry
      }
      throw new Error(`Erro ao buscar círculo: ${response.status}`)
    }

    const data = await response.json()

    if (!data.circles || data.circles.length === 0) {
      throw new Error('Nenhum círculo Life360 encontrado')
    }

    life360CircleId = data.circles[0].id
    console.log(`📍 Círculo Life360: ${data.circles[0].name}`)

    return life360CircleId

  } catch (erro) {
    console.error('❌ Erro ao buscar círculo:', erro.message)
    throw erro
  }
}

/**
 * Buscar localização de um Tile específico
 */
async function buscarLocalizacaoTile(tileId) {
  try {
    if (!life360CircleId) await getLife360Circle()

    // Buscar membros e devices do círculo
    const response = await fetch(
      `https://api-cloudfront.life360.com/v3/circles/${life360CircleId}`,
      {
        headers: {
          'Authorization': `Bearer ${life360Token}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Erro ao buscar Tiles: ${response.status}`)
    }

    const data = await response.json()

    // Procurar o Tile específico
    // Tiles aparecem como "devices" ou "members" dependendo da versão da API
    let tile = null

    if (data.devices) {
      tile = data.devices.find(d => d.id === tileId)
    }

    if (!tile && data.members) {
      tile = data.members.find(m => m.id === tileId)
    }

    if (!tile) {
      console.log(`⚠️ Tile ${tileId} não encontrado`)
      return null
    }

    // Extrair localização
    const location = tile.location || tile.features?.location

    if (!location || !location.latitude || !location.longitude) {
      console.log(`⚠️ Tile ${tileId} sem localização recente`)
      return null
    }

    const resultado = {
      tileId,
      latitude: parseFloat(location.latitude),
      longitude: parseFloat(location.longitude),
      timestamp: new Date(location.timestamp * 1000 || Date.now()),
      accuracy: location.accuracy || null,
      battery: tile.battery || null
    }

    console.log(`📍 Tile ${tileId}: ${resultado.latitude.toFixed(6)}, ${resultado.longitude.toFixed(6)}`)

    return resultado

  } catch (erro) {
    console.error(`❌ Erro ao buscar Tile ${tileId}:`, erro.message)
    return null
  }
}

// ============================================================
// CÁLCULO DE DISTÂNCIA
// ============================================================

/**
 * Calcular distância entre dois pontos (Haversine)
 * @returns {number} Distância em metros
 */
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Raio da Terra em metros
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distancia = R * c

  return distancia
}

// ============================================================
// BANCO DE DADOS
// ============================================================

/**
 * Salvar localização no PostgreSQL
 */
async function salvarLocalizacao(location) {
  try {
    await pool.query(`
      INSERT INTO rastreamento_tiles
      (tile_id, latitude, longitude, timestamp, accuracy, battery)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tile_id)
      DO UPDATE SET
        latitude = $2,
        longitude = $3,
        timestamp = $4,
        accuracy = $5,
        battery = $6
    `, [
      location.tileId,
      location.latitude,
      location.longitude,
      location.timestamp,
      location.accuracy,
      location.battery
    ])

    console.log(`💾 Localização salva: Tile ${location.tileId}`)

  } catch (erro) {
    console.error('❌ Erro ao salvar no banco:', erro.message)
  }
}

/**
 * Buscar embarcação pelo Tile ID
 */
async function buscarEmbarcacaoPorTile(tileId) {
  try {
    const res = await pool.query(`
      SELECT
        e."Num_PB" as pb,
        s."ID" as agendamento_id,
        s."Grupo_Comp_letra" as grupo,
        s."grupowppid" as grupo_wpp_id
      FROM rastreamento_tiles rt
      JOIN "P_BOAT_1_Embarcacao" e ON rt.embarcacao_pb = e."Num_PB"
      LEFT JOIN "P_BOAT_z_10_Saida_Emb" s
        ON s."Cod_Emb_PB" = e."Num_PB"
        AND s."Dt_Retorno" IS NULL
        AND s."Dt_Desistencia" IS NULL
      WHERE rt.tile_id = $1
      LIMIT 1
    `, [tileId])

    return res.rows[0] || null

  } catch (erro) {
    console.error('❌ Erro ao buscar embarcação:', erro.message)
    return null
  }
}

// ============================================================
// VERIFICAÇÃO 70 METROS
// ============================================================

/**
 * Verificar se embarcação está dentro dos 70m
 */
async function verificarDistancia70m(location, sock) {
  try {
    const distancia = calcularDistancia(
      location.latitude,
      location.longitude,
      LAT_MARINA,
      LON_MARINA
    )

    console.log(`📏 Distância da marina: ${distancia.toFixed(1)}m`)

    if (distancia <= RAIO_70M) {
      console.log('🎯 EMBARCAÇÃO DENTRO DOS 70M!')

      // Buscar dados da embarcação
      const embarcacao = await buscarEmbarcacaoPorTile(location.tileId)

      if (!embarcacao || !embarcacao.agendamento_id) {
        console.log('⚠️ Embarcação sem saída ativa')
        return
      }

      // Verificar se já perguntou recentemente
      const jaPergun tou = await verificarPerguntaRecente(embarcacao.agendamento_id)

      if (jaPerguntou) {
        console.log('⏸️ Já perguntou recentemente (aguardando resposta)')
        return
      }

      // Enviar pergunta de confirmação
      await enviarPerguntaConfirmacao70m(
        sock,
        embarcacao.grupo_wpp_id,
        embarcacao.pb,
        embarcacao.grupo,
        embarcacao.agendamento_id,
        distancia
      )
    }

  } catch (erro) {
    console.error('❌ Erro ao verificar 70m:', erro.message)
  }
}

/**
 * Verificar se já perguntou nos últimos 5 minutos
 */
async function verificarPerguntaRecente(agendamentoId) {
  try {
    const res = await pool.query(`
      SELECT
        timestamp
      FROM confirmacoes_70m
      WHERE agendamento_id = $1
      AND timestamp > NOW() - INTERVAL '5 minutes'
      ORDER BY timestamp DESC
      LIMIT 1
    `, [agendamentoId])

    return res.rows.length > 0

  } catch (erro) {
    console.error('Erro ao verificar pergunta recente:', erro)
    return false
  }
}

/**
 * Enviar pergunta de confirmação via WhatsApp
 */
async function enviarPerguntaConfirmacao70m(sock, grupoWppId, pb, grupo, agendamentoId, distancia) {
  try {
    const mensagem =
      `🚤 *CONFIRMAÇÃO DE RETORNO*\n\n` +
      `Emb ${pb} - ${grupo}\n` +
      `Distância: ${distancia.toFixed(0)}m da marina\n\n` +
      `A embarcação está retornando?\n` +
      `Responda: *S* (sim) ou *N* (não)`

    await sock.sendMessage(grupoWppId, { text: mensagem })

    // Registrar pergunta
    await pool.query(`
      INSERT INTO confirmacoes_70m
      (agendamento_id, tile_id, distancia, timestamp)
      VALUES ($1, $2, $3, NOW())
    `, [agendamentoId, `tile-${pb}`, distancia])

    console.log(`✅ Pergunta enviada ao grupo ${grupo}`)

  } catch (erro) {
    console.error('❌ Erro ao enviar pergunta:', erro.message)
  }
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================

/**
 * Processar todos os Tiles
 */
async function processarTiles(sock) {
  try {
    console.log('\n🔄 Iniciando verificação de Tiles...')

    // Buscar todos os Tiles cadastrados
    const res = await pool.query(`
      SELECT tile_id, embarcacao_pb
      FROM rastreamento_tiles
      WHERE ativo = true
    `)

    if (res.rows.length === 0) {
      console.log('⚠️ Nenhum Tile cadastrado')
      return
    }

    console.log(`📍 ${res.rows.length} Tiles para verificar`)

    // Processar cada Tile
    for (const row of res.rows) {
      const location = await buscarLocalizacaoTile(row.tile_id)

      if (location) {
        await salvarLocalizacao(location)
        await verificarDistancia70m(location, sock)
      }

      // Aguardar 1s entre requisições (rate limiting)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log('✅ Verificação concluída\n')

  } catch (erro) {
    console.error('❌ Erro ao processar Tiles:', erro.message)
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

/**
 * Iniciar sistema de rastreamento
 */
export async function iniciarRastreamentoTiles(sock) {
  try {
    console.log('🚀 Iniciando sistema de rastreamento Tile...')

    // Fazer login Life360
    await loginLife360()
    await getLife360Circle()

    // Executar imediatamente
    await processarTiles(sock)

    // Executar a cada 5 minutos
    setInterval(async () => {
      await processarTiles(sock)
    }, 5 * 60 * 1000)

    console.log('✅ Sistema de rastreamento Tile ativo')
    console.log('⏰ Verificando a cada 5 minutos')

  } catch (erro) {
    console.error('❌ Erro ao iniciar rastreamento:', erro.message)
  }
}

// ============================================================
// SQL: CRIAR TABELAS (execute uma vez)
// ============================================================

export const SQL_CRIAR_TABELAS = `
-- Tabela de rastreamento Tiles
CREATE TABLE IF NOT EXISTS rastreamento_tiles (
  tile_id VARCHAR(100) PRIMARY KEY,
  embarcacao_pb INTEGER REFERENCES "P_BOAT_1_Embarcacao"("Num_PB"),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  timestamp TIMESTAMP WITH TIME ZONE,
  accuracy DECIMAL(8, 2),
  battery INTEGER,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de confirmações 70m
CREATE TABLE IF NOT EXISTS confirmacoes_70m (
  id SERIAL PRIMARY KEY,
  agendamento_id INTEGER REFERENCES "P_BOAT_z_10_Saida_Emb"("ID"),
  tile_id VARCHAR(100),
  distancia DECIMAL(8, 2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tiles_embarcacao
  ON rastreamento_tiles(embarcacao_pb);

CREATE INDEX IF NOT EXISTS idx_confirmacoes_agendamento
  ON confirmacoes_70m(agendamento_id, timestamp DESC);
`;
