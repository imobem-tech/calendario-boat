// ============================================================
// wpp/simular_fila.js — V.2606022310
// Simula 20 barcos com posições aleatórias 20-100m da marina
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

// Marina Palmas-TO
const PORTO_LAT = -10.21101
const PORTO_LON = -48.36912

// ============================================================
// CALCULAR LAT/LON A PARTIR DE DISTÂNCIA E BEARING
// ============================================================
function calcularNovaPosicao(lat, lon, distanciaMetros, bearingGraus) {
  const R = 6371e3 // raio da Terra em metros
  const φ1 = lat * Math.PI / 180
  const λ1 = lon * Math.PI / 180
  const bearing = bearingGraus * Math.PI / 180

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(distanciaMetros / R) +
    Math.cos(φ1) * Math.sin(distanciaMetros / R) * Math.cos(bearing)
  )

  const λ2 = λ1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distanciaMetros / R) * Math.cos(φ1),
    Math.cos(distanciaMetros / R) - Math.sin(φ1) * Math.sin(φ2)
  )

  return {
    lat: φ2 * 180 / Math.PI,
    lon: λ2 * 180 / Math.PI
  }
}

// ============================================================
// GERAR POSIÇÕES ALEATÓRIAS
// ============================================================
function gerarPosicoes(quantidade, distanciaMin, distanciaMax) {
  const posicoes = []

  for (let i = 0; i < quantidade; i++) {
    const distancia = Math.random() * (distanciaMax - distanciaMin) + distanciaMin
    const bearing = Math.random() * 360 // direção aleatória
    const velocidade = Math.random() * 30 + 10 // 10-40 km/h

    const pos = calcularNovaPosicao(PORTO_LAT, PORTO_LON, distancia, bearing)

    posicoes.push({
      pb: 100 + i,
      cota: i % 2 === 0 ? 'X' + (i + 1) : null,
      latitude: pos.lat,
      longitude: pos.lon,
      velocidade,
      distancia: Math.round(distancia)
    })
  }

  return posicoes
}

// ============================================================
// INSERIR SIMULAÇÃO NO BANCO
// ============================================================
async function simularFila() {
  try {
    console.log('🎬 INICIANDO SIMULAÇÃO DE 20 BARCOS...\n')

    // Gerar 20 posições aleatórias entre 20-100m
    const posicoes = gerarPosicoes(20, 20, 100)

    // Para cada posição:
    // 1. Criar agendamento fake
    // 2. Inserir localização

    for (const pos of posicoes) {
      // Criar agendamento fake
      const rsAg = await pool.query(`
        INSERT INTO public."P_BOAT_z_10_Saida_Emb" (
          "Cod_Emb_PB",
          "Grupo_Comp_letra",
          "Dt_Agendamento",
          "Dt_Saída",
          "Cod_Autorizado",
          "Nome_Embarcacao"
        ) VALUES (
          $1,
          $2,
          NOW() AT TIME ZONE 'America/Sao_Paulo',
          NOW() AT TIME ZONE 'America/Sao_Paulo',
          1,
          $3
        )
        RETURNING "ID"
      `, [
        pos.pb,
        pos.cota,
        `SIMUL-${pos.pb}${pos.cota || ''}`
      ])

      const agendamentoId = rsAg.rows[0].ID

      // Inserir localização
      await pool.query(`
        INSERT INTO public.wpp_localizacao_emb (
          agendamento_id,
          pb,
          cota,
          latitude,
          longitude,
          velocidade_kmh,
          distancia_porto_m,
          criado_em
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() AT TIME ZONE 'America/Sao_Paulo')
      `, [
        agendamentoId,
        pos.pb,
        pos.cota,
        pos.latitude,
        pos.longitude,
        pos.velocidade,
        pos.distancia
      ])

      console.log(`✅ ${pos.pb}-${pos.cota || '?'} → ${pos.distancia}m (${pos.velocidade.toFixed(1)}km/h)`)
    }

    console.log(`\n🎉 SIMULAÇÃO COMPLETA!`)
    console.log(`📍 20 barcos criados entre 20-100m da marina`)
    console.log(`\n🗺️  MAPA: https://calendario-boat-production.up.railway.app/rastrear.html`)
    console.log(`\n⚠️  LIMPAR DEPOIS: node wpp/limpar_simulacao.js\n`)

  } catch (erro) {
    console.error('❌ Erro na simulação:', erro)
  } finally {
    await pool.end()
  }
}

simularFila()
