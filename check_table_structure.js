import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/NOTEBOOK/projetos/calendario_allmax/.env' });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'bank_extratos'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Estrutura da tabela bank_extratos:');
    console.table(result.rows);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
