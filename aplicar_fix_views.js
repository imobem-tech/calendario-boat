// ============================================================
// Aplicar correção de ordenação nas views
// V.2606041352
// ============================================================

import pkg from 'pg'
import fs from 'fs'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function aplicar() {
  console.log('🔧 Aplicando correção de ordenação nas views...\n')

  // Ler o arquivo SQL
  const sql = fs.readFileSync('fix_ordenacao_views.sql', 'utf8')

  try {
    // Executar o SQL
    await pool.query(sql)

    console.log('✅ Views atualizadas com sucesso!\n')
    console.log('📋 Mudanças aplicadas:')
    console.log('   • vw_saida_emb_abertas_agenda')
    console.log('   • vw_saida_emb_abertas_todas')
    console.log('')
    console.log('🔄 Nova ordenação:')
    console.log('   1º: Dt_Saída (NULL primeiro = ainda não saiu)')
    console.log('   2º: Dt_Agendamento')
    console.log('')
    console.log('⚠️  AÇÃO NECESSÁRIA NO ACCESS VBA:')
    console.log('   Alterar btnAlternarFiltro_Click() e Form_Load()')
    console.log('   DE:   ORDER BY [Dt_Agendamento], [Dt_Saída]')
    console.log('   PARA: ORDER BY [Dt_Saída], [Dt_Agendamento]')

  } catch (err) {
    console.error('❌ Erro ao aplicar views:', err.message)
    throw err
  } finally {
    await pool.end()
  }
}

aplicar().catch(err => {
  console.error(err)
  process.exit(1)
})
