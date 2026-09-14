import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function verRules() {
  try {
    console.log('🔍 Procurando RULES em P_BOAT_z_10_Saida_Emb...\n');

    const rules = await pool.query(`
      SELECT
        r.rulename,
        pg_get_ruledef(r.oid) as definition
      FROM pg_rewrite r
      JOIN pg_class c ON c.oid = r.ev_class
      WHERE c.relname = 'P_BOAT_z_10_Saida_Emb'
        AND r.rulename != '_RETURN'
    `);

    if (rules.rows.length > 0) {
      console.log('✅ RULES ENCONTRADAS:');
      rules.rows.forEach(r => {
        console.log(`\n📌 ${r.rulename}`);
        console.log(`Definition:\n${r.definition}`);
      });
    } else {
      console.log('❌ Nenhuma RULE encontrada');
    }

    // Também verificar triggers com mais detalhes
    console.log('\n🔍 Verificando triggers novamente com detalhes...\n');
    
    const triggers = await pool.query(`
      SELECT
        t.tgname as trigger_name,
        pg_get_triggerdef(t.oid) as trigger_definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'P_BOAT_z_10_Saida_Emb'
        AND NOT t.tgisinternal
    `);

    if (triggers.rows.length > 0) {
      console.log('✅ TRIGGERS ENCONTRADOS:');
      triggers.rows.forEach(t => {
        console.log(`\n📌 ${t.trigger_name}`);
        console.log(`${t.trigger_definition}`);
      });
    } else {
      console.log('❌ Nenhum trigger encontrado');
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verRules();
