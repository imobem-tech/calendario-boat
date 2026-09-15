import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const {Pool} = pkg;
const pool = new Pool({connectionString: process.env.DATABASE_URL});

async function verCampos() {
  try {
    console.log('\n📋 CAMPOS DE DATA/HORA DA TABELA bank_extratos:\n');

    // Buscar estrutura da tabela
    const colunas = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bank_extratos'
        AND (data_type LIKE '%timestamp%' OR data_type LIKE '%date%' OR column_name LIKE '%data%' OR column_name LIKE '%created%' OR column_name LIKE '%updated%')
      ORDER BY ordinal_position
    `);

    console.log('Colunas com data/timestamp:\n');
    colunas.rows.forEach(col => {
      console.log(`  • ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(30)} | ${col.is_nullable}`);
    });

    console.log('\n' + '='.repeat(80) + '\n');

    // Buscar 1 exemplo de registro OFX
    const exemplo = await pool.query(`
      SELECT *
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND tipo_importacao = 'OFX'
      ORDER BY id DESC
      LIMIT 1
    `);

    if (exemplo.rows.length > 0) {
      const reg = exemplo.rows[0];
      console.log('📊 EXEMPLO DE REGISTRO OFX (ID ' + reg.id + '):\n');

      // Mostrar todos os campos de data
      Object.keys(reg).forEach(key => {
        const valor = reg[key];
        if (valor instanceof Date || key.toLowerCase().includes('data') || key.toLowerCase().includes('created') || key.toLowerCase().includes('updated')) {
          const valorFormatado = valor instanceof Date ? valor.toISOString() : valor;
          console.log(`  ${key.padEnd(30)}: ${valorFormatado}`);
        }
      });
    }

    await pool.end();

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

verCampos();
