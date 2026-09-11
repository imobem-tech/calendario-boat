import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

try {
  const r = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'Cliente'
    ORDER BY ordinal_position
  `);
  console.log('📊 Tabela Cliente:');
  console.table(r.rows);
} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
