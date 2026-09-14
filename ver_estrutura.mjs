import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'mae_empresa'
    ORDER BY ordinal_position
  `);

  console.log('Estrutura da tabela mae_empresa:\n');
  result.rows.forEach(r => {
    console.log(`  ${r.column_name} (${r.data_type})`);
  });

  console.log('\n\nDados:\n');
  const dados = await pool.query(`SELECT * FROM mae_empresa LIMIT 5`);
  console.log(dados.rows);

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
