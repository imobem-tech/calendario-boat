// ============================================================
// Testar view via PostgreSQL direto
// V.2606041425
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function testar() {
  console.log('🔍 Testando view vw_saida_emb_abertas_agenda...\n')

  try {
    // Testar a view diretamente
    const res = await pool.query(`
      SELECT
        "ID",
        "Cod_Emb_PB",
        "Cliente_Titular",
        "Dt_Saída",
        "Dt_Agendamento",
        "N_Saiu"
      FROM vw_saida_emb_abertas_agenda
      LIMIT 10
    `)

    console.log(`✅ View retornou ${res.rows.length} registros\n`)

    console.log('📋 Primeiros registros:')
    console.log('═══════════════════════════════════════════════════════════')

    res.rows.forEach((row, i) => {
      console.log(`\n${i + 1}. ${row.Cliente_Titular}`)
      console.log(`   Dt_Saída: ${row.Dt_Saída || 'NULL (ainda não saiu)'}`)
      console.log(`   Dt_Agendamento: ${row.Dt_Agendamento}`)
      console.log(`   N_Saiu: ${row.N_Saiu}`)
    })

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('\n✅ Teste concluído sem erros!')
    console.log('\nSe o Access está dando erro, pode ser:')
    console.log('1. Problema no driver ODBC PostgreSQL')
    console.log('2. Campo com nome problemático (acentos, espaços)')
    console.log('3. Tipo de dado incompatível entre PostgreSQL e Access')
    console.log('4. Tabela vinculada desatualizada (precisa revinculá-la)')

  } catch (err) {
    console.error('\n❌ ERRO ao consultar view:', err.message)
    console.error('\nDetalhes:', err)
  } finally {
    await pool.end()
  }
}

testar()
