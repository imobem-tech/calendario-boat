import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'P_BOAT_4_Autorizados'
  ORDER BY ordinal_position
`);

console.log('TODAS as colunas:');
result.rows.forEach(r => console.log(`  ${r.column_name}`));
await pool.end();
