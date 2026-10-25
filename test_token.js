// Test token no banco de dados
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const token = 'Ny0xNzkyODg3MzQwNjcwLTAuMzI4OTA4';

console.log('🔍 Buscando token no banco...\n');

try {
  const result = await pool.query(`
    SELECT
      id_orcamento,
      numero,
      descricao,
      token_visualizacao,
      status
    FROM orcamento_servico
    WHERE token_visualizacao = $1
  `, [token]);

  if (result.rows.length === 0) {
    console.log('❌ TOKEN NÃO ENCONTRADO NO BANCO!');
    console.log('Token buscado:', token);
  } else {
    console.log('✅ TOKEN ENCONTRADO:\n');
    console.log(JSON.stringify(result.rows[0], null, 2));
  }

  await pool.end();
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
