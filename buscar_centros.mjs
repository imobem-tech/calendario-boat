import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  // Primeiro ver estrutura
  const struct = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'Centros_Custos'
    ORDER BY ordinal_position
  `);

  console.log('Estrutura Centros_Custos:\n');
  struct.rows.forEach(r => {
    console.log(`  ${r.column_name} (${r.data_type})`);
  });

  // Buscar dados
  console.log('\n\n🔍 Dados dos centros de custo:\n');
  const dados = await pool.query(`SELECT * FROM "Centros_Custos" WHERE "Token_Asaas" IS NOT NULL LIMIT 10`);
  
  console.log(JSON.stringify(dados.rows, null, 2));

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
