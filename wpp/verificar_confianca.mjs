import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

try {
  const r = await pool.query(`
    SELECT column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name = 'bank_regras_classificacao'
      AND column_name = 'confianca_base'
  `);

  console.log('📊 Campo confianca_base:');
  console.table(r.rows);

  // Alterar para INTEGER (0-100)
  console.log('\n📝 Alterando para INTEGER...');
  await pool.query('ALTER TABLE bank_regras_classificacao ALTER COLUMN confianca_base TYPE INTEGER');
  console.log('✅ Alterado!');

} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
