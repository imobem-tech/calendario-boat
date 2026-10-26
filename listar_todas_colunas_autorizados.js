// Listar TODAS as colunas de P_BOAT_4_Autorizados
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('📊 TODAS as colunas de P_BOAT_4_Autorizados:\n');

try {
  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'P_BOAT_4_Autorizados'
    ORDER BY ordinal_position
  `);

  result.rows.forEach((row, i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${row.column_name.padEnd(40)} (${row.data_type})`);
  });

  await pool.end();
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
