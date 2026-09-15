// Verificar campo classificacao dos registros 12/09
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verificar() {
  try {
    console.log('\n📋 REGISTROS DO DIA 12/09/2026:\n');
    console.log('='.repeat(120));

    const result = await pool.query(`
      SELECT
        id,
        data,
        descricao_original,
        classificacao,
        status,
        CASE
          WHEN classificacao IS NULL THEN 'NULL'
          WHEN classificacao = '' THEN 'VAZIO'
          ELSE 'TEM VALOR: "' || classificacao || '"'
        END as classificacao_status
      FROM bank_extratos
      WHERE data = '2026-09-12'
        AND empresa = 'ALLMAX'
        AND descricao_original LIKE '%Taxa%'
      ORDER BY id
      LIMIT 20
    `);

    if (result.rows.length === 0) {
      console.log('❌ Nenhum registro encontrado!');
    } else {
      result.rows.forEach(r => {
        console.log(`ID: ${r.id}`);
        console.log(`Data: ${r.data}`);
        console.log(`Descrição: ${r.descricao_original.substring(0, 80)}`);
        console.log(`Classificação: ${r.classificacao_status}`);
        console.log(`Status: ${r.status || '(null)'}`);
        console.log('-'.repeat(120));
      });
      console.log(`\n✅ Total: ${result.rows.length} registros\n`);
    }

    await pool.end();
  } catch (err) {
    console.error('Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

verificar();
