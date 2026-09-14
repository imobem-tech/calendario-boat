import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function verTriggerAgendamento() {
  try {
    console.log('🔍 Verificando triggers em P_BOAT_z_10_Saida_Emb...\n');

    const triggers = await pool.query(`
      SELECT
        t.trigger_name,
        t.event_manipulation,
        t.action_timing,
        t.action_statement,
        p.proname as function_name
      FROM information_schema.triggers t
      LEFT JOIN pg_proc p ON p.oid = (
        SELECT oid FROM pg_proc 
        WHERE proname = LOWER(SPLIT_PART(t.action_statement, ' ', 2))
        LIMIT 1
      )
      WHERE t.event_object_table = 'P_BOAT_z_10_Saida_Emb'
    `);

    if (triggers.rows.length > 0) {
      console.log('✅ TRIGGERS ENCONTRADOS:');
      triggers.rows.forEach(t => {
        console.log(`\n📌 ${t.trigger_name}`);
        console.log(`   Quando: ${t.action_timing} ${t.event_manipulation}`);
        console.log(`   Ação: ${t.action_statement}`);
        if (t.function_name) {
          console.log(`   Função: ${t.function_name}`);
        }
      });
    } else {
      console.log('❌ Nenhum trigger encontrado em P_BOAT_z_10_Saida_Emb');
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verTriggerAgendamento();
