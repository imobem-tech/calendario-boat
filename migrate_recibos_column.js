import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // Adicionar coluna recibos_urls (JSONB)
    await pool.query(`
      ALTER TABLE bank_extratos
      ADD COLUMN IF NOT EXISTS recibos_urls JSONB DEFAULT '[]'::jsonb
    `);

    console.log('✅ Coluna recibos_urls adicionada com sucesso!');

    // Verificar estrutura
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'bank_extratos'
      AND column_name IN ('recibos_urls', 'observacoes')
      ORDER BY column_name
    `);

    console.log('\n📋 Colunas relevantes:');
    console.table(result.rows);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
