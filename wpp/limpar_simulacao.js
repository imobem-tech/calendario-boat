// ============================================================
// wpp/limpar_simulacao.js — V.2606022310
// Remove dados da simulação (PB 100-119)
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

async function limparSimulacao() {
  try {
    console.log('🧹 LIMPANDO SIMULAÇÃO...\n')

    // Deletar localizações
    const rsLoc = await pool.query(`
      DELETE FROM public.wpp_localizacao_emb
      WHERE pb >= 100 AND pb < 120
      RETURNING pb, cota
    `)

    console.log(`🗑️  ${rsLoc.rowCount} localizações removidas`)

    // Deletar agendamentos
    const rsAg = await pool.query(`
      DELETE FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" >= 100 AND "Cod_Emb_PB" < 120
      RETURNING "ID", "Cod_Emb_PB", "Grupo_Comp_letra"
    `)

    console.log(`🗑️  ${rsAg.rowCount} agendamentos removidos`)

    console.log(`\n✅ SIMULAÇÃO LIMPA!\n`)

  } catch (erro) {
    console.error('❌ Erro ao limpar:', erro)
  } finally {
    await pool.end()
  }
}

limparSimulacao()
