// Ver campos da tabela orcamento_servico
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'orcamento_servico'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 CAMPOS DA TABELA orcamento_servico:\n');
    console.log('Campo'.padEnd(30) + 'Tipo'.padEnd(20) + 'Tam');
    console.log('-'.repeat(60));

    result.rows.forEach(r => {
      const tam = r.character_maximum_length ? `(${r.character_maximum_length})` : '';
      console.log(
        r.column_name.padEnd(30) +
        r.data_type.padEnd(20) +
        tam
      );
    });

    console.log('\nTotal: ' + result.rows.length + ' campos\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await pool.end();
  }
})();
