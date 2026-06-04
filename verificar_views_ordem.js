// ============================================================
// Verificar Views de Saída - Ordem de Apresentação
// V.2606041345
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function verificar() {
  console.log('🔍 Verificando definição das views...\n')

  // Buscar definição das views
  const resViews = await pool.query(`
    SELECT
      schemaname,
      viewname,
      definition
    FROM pg_views
    WHERE viewname IN ('vw_saida_emb_abertas_agenda', 'vw_saida_emb_abertas_todas')
    ORDER BY viewname
  `)

  if (!resViews.rows.length) {
    console.log('❌ Views não encontradas no banco Neon')
    console.log('')
    console.log('As views podem estar sendo criadas pelo Access localmente,')
    console.log('ou podem ter nomes diferentes no PostgreSQL.')
  } else {
    resViews.rows.forEach(view => {
      console.log('═══════════════════════════════════════════')
      console.log(`📋 View: ${view.viewname}`)
      console.log('═══════════════════════════════════════════')
      console.log(view.definition)
      console.log('')

      // Verificar se tem ORDER BY na definição
      if (view.definition.includes('ORDER BY')) {
        console.log('✅ Tem cláusula ORDER BY na view')
        const orderByMatch = view.definition.match(/ORDER BY[^;]+/i)
        if (orderByMatch) {
          console.log(`   ${orderByMatch[0]}`)
        }
      } else {
        console.log('⚠️  SEM cláusula ORDER BY na view')
        console.log('   A ordenação é feita apenas no VBA')
      }
      console.log('')
    })
  }

  console.log('═══════════════════════════════════════════')
  console.log('📊 COMPARAÇÃO DE ORDENAÇÃO')
  console.log('═══════════════════════════════════════════')
  console.log('')
  console.log('SQL Original (primeira query fornecida):')
  console.log('   ORDER BY Dt_Saída, Dt_Agendamento')
  console.log('   1º: Dt_Saída (quem saiu primeiro)')
  console.log('   2º: Dt_Agendamento')
  console.log('')
  console.log('VBA Access (código local):')
  console.log('   ORDER BY Dt_Agendamento, Dt_Saída')
  console.log('   1º: Dt_Agendamento (ordem de agendamento)')
  console.log('   2º: Dt_Saída')
  console.log('')
  console.log('❌ ORDEM ESTÁ INVERTIDA!')
  console.log('')
  console.log('💡 RECOMENDAÇÃO:')
  console.log('   Padronizar qual ordem usar:')
  console.log('   A) Manter SQL original (Dt_Saída primeiro) → Corrigir VBA')
  console.log('   B) Manter VBA (Dt_Agendamento primeiro) → Corrigir SQL')
  console.log('')
  console.log('   Qual faz mais sentido?')
  console.log('   - Dt_Saída primeiro: Mostra quem está FORA em ordem de saída')
  console.log('   - Dt_Agendamento primeiro: Mostra em ordem cronológica de agenda')

  await pool.end()
}

verificar().catch(err => {
  console.error('❌ Erro:', err.message)
  console.error(err.stack)
  process.exit(1)
})
