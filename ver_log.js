import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'orcamento_log'
  ORDER BY ordinal_position
`);

console.log('📊 Colunas da tabela orcamento_log:\n');
result.rows.forEach(col => {
  console.log(`  ${col.column_name.padEnd(30)} ${col.data_type}`);
});

await pool.end();
