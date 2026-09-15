// Listar todas as regras
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function listar() {
  try {
    const result = await pool.query(`
      SELECT id, nome_regra, empresa, ativa, ativo, palavras_chave, classificacao, prioridade
      FROM bank_regras_classificacao
      ORDER BY id
    `);

    console.log('\n📋 TODAS AS REGRAS DE CLASSIFICAÇÃO:');
    console.log('='.repeat(120));
    console.log('ID'.padEnd(5) + 'Nome'.padEnd(25) + 'Empresa'.padEnd(12) + 'Ativa'.padEnd(8) + 'Ativo'.padEnd(8) + 'Prioridade'.padEnd(12) + 'Palavras-chave');
    console.log('-'.repeat(120));

    result.rows.forEach(r => {
      console.log(
        String(r.id).padEnd(5) +
        (r.nome_regra || '(sem nome)').padEnd(25) +
        (r.empresa || '(todas)').padEnd(12) +
        String(r.ativa).padEnd(8) +
        String(r.ativo).padEnd(8) +
        String(r.prioridade || '-').padEnd(12) +
        (r.palavras_chave || '(sem palavras)')
      );
    });

    console.log('='.repeat(120));
    console.log(`\n📊 Total: ${result.rows.length} regras cadastradas\n`);

    // Regras ativas para ALLMAX
    const ativas = result.rows.filter(r => r.ativa && r.ativo && (r.empresa === 'ALLMAX' || !r.empresa));
    console.log(`✅ Ativas para ALLMAX: ${ativas.length}`);
    ativas.forEach(r => console.log(`   - ID ${r.id}: ${r.nome_regra}`));

    await pool.end();
  } catch (err) {
    console.error('Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

listar();
