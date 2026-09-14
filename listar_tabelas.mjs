import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  console.log('🔍 Listando tabelas relacionadas a empresas/asaas...\n');

  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND (
        table_name ILIKE '%empres%' 
        OR table_name ILIKE '%asaas%'
        OR table_name ILIKE '%centro%'
        OR table_name ILIKE '%config%'
      )
    ORDER BY table_name
  `);

  console.log(`Tabelas encontradas:\n`);
  result.rows.forEach(r => {
    console.log(`  - ${r.table_name}`);
  });

  // Tentar buscar em todas as tabelas que tenham campo asaas_api_key
  console.log('\n\n🔍 Buscando colunas "asaas_api_key"...\n');
  
  const cols = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name ILIKE '%asaas%api%'
    ORDER BY table_name
  `);

  if (cols.rows.length > 0) {
    console.log('Colunas relacionadas a Asaas API:\n');
    cols.rows.forEach(r => {
      console.log(`  ${r.table_name}.${r.column_name}`);
    });
  }

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
