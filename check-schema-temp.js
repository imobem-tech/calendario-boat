import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const res = await pool.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'Contas_Receber'
  ORDER BY ordinal_position
`);

console.log('Colunas da tabela Contas_Receber:\n');
res.rows.forEach(r => {
  console.log(`  ${r.column_name} (${r.data_type})`);
});

await pool.end();
