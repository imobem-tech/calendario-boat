import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const {Pool} = pkg;
const pool = new Pool({connectionString: process.env.DATABASE_URL});

async function verificar() {
  try {
    console.log('\n🔍 VERIFICANDO ESTRUTURA DAS TABELAS...\n');
    console.log('='.repeat(80) + '\n');

    // Tabela Cliente
    console.log('📋 TABELA Cliente:\n');
    const cliente = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Cliente'
      ORDER BY ordinal_position
      LIMIT 20
    `);

    if (cliente.rows.length > 0) {
      cliente.rows.forEach(col => {
        console.log(`  • ${col.column_name.padEnd(30)} | ${col.data_type}`);
      });
    } else {
      console.log('  ⚠️  Tabela não encontrada ou sem colunas');
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Tabela Contas_Receber
    console.log('📋 TABELA Contas_Receber:\n');
    const cr = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Contas_Receber'
      ORDER BY ordinal_position
      LIMIT 20
    `);

    if (cr.rows.length > 0) {
      cr.rows.forEach(col => {
        console.log(`  • ${col.column_name.padEnd(30)} | ${col.data_type}`);
      });
    } else {
      console.log('  ⚠️  Tabela não encontrada ou sem colunas');
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Verificar campo chave_aprendida em bank_extratos
    console.log('📋 CAMPO chave_aprendida em bank_extratos:\n');
    const chave = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'bank_extratos'
        AND column_name = 'chave_aprendida'
    `);

    if (chave.rows.length > 0) {
      console.log(`  ✅ Campo existe: ${chave.rows[0].data_type}\n`);
    } else {
      console.log('  ⚠️  Campo não encontrado\n');
    }

    // Exemplo de registro com chave_aprendida
    const exemplo = await pool.query(`
      SELECT id, descricao_original, chave_aprendida, classificacao
      FROM bank_extratos
      WHERE chave_aprendida IS NOT NULL
      LIMIT 3
    `);

    if (exemplo.rows.length > 0) {
      console.log('📊 EXEMPLOS DE REGISTROS COM CHAVE_APRENDIDA:\n');
      exemplo.rows.forEach(r => {
        console.log(`  ID ${r.id}:`);
        console.log(`    Descrição: ${r.descricao_original.substring(0, 50)}`);
        console.log(`    Chave: ${r.chave_aprendida}`);
        console.log(`    Classificação: ${r.classificacao}\n`);
      });
    }

    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verificar();
