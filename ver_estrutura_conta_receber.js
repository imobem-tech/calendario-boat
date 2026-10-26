// Ver estrutura da tabela orcamento_conta_receber
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('📊 Estrutura da tabela orcamento_conta_receber:\n');

try {
  const colunas = await pool.query(`
    SELECT
      column_name,
      data_type,
      character_maximum_length,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = 'orcamento_conta_receber'
    ORDER BY ordinal_position
  `);

  colunas.rows.forEach(col => {
    const len = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
    const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
    const def = col.column_default ? ` DEFAULT ${col.column_default}` : '';
    console.log(`  ${col.column_name.padEnd(30)} ${col.data_type}${len} ${nullable}${def}`);
  });

  await pool.end();
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
