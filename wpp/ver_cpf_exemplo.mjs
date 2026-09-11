import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

try {
  const r = await pool.query(`
    SELECT "ID", "Cliente_Nome", "Cliente_CPF", LENGTH("Cliente_CPF") as tamanho
    FROM "Cliente"
    WHERE "Cliente_CPF" IS NOT NULL
    LIMIT 5
  `);
  console.log('📊 Exemplos de CPF:');
  console.table(r.rows);
} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
