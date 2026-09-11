import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

try {
  const result = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'bank_regras_classificacao'
    ORDER BY ordinal_position
  `);

  console.log('📊 Schema bank_regras_classificacao:');
  console.table(result.rows);

} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
