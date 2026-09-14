import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function verTriggers() {
  try {
    console.log('🔍 Procurando triggers em P_BOAT_9_OS...\n');

    // Buscar triggers
    const triggers = await pool.query(`
      SELECT
        trigger_name,
        event_manipulation,
        action_statement,
        action_timing
      FROM information_schema.triggers
      WHERE event_object_table = 'P_BOAT_9_OS'
    `);

    if (triggers.rows.length > 0) {
      console.log('🎯 Triggers encontrados:');
      triggers.rows.forEach(t => {
        console.log(`\n   Trigger: ${t.trigger_name}`);
        console.log(`   Quando: ${t.action_timing} ${t.event_manipulation}`);
        console.log(`   Ação: ${t.action_statement}`);
      });
    } else {
      console.log('⚠️ Nenhum trigger encontrado em P_BOAT_9_OS');
    }

    // Buscar funções que mencionam OS_Numero
    console.log('\n🔍 Procurando funções que mencionam OS_Numero...\n');
    
    const funcoes = await pool.query(`
      SELECT
        routine_name,
        routine_definition
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_definition ILIKE '%os_numero%'
    `);

    if (funcoes.rows.length > 0) {
      console.log('📝 Funções encontradas:');
      funcoes.rows.forEach(f => {
        console.log(`\n   Função: ${f.routine_name}`);
        console.log(`   Definição: ${f.routine_definition.substring(0, 200)}...`);
      });
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verTriggers();
