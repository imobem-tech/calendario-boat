import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function encontrar() {
  try {
    console.log('\n🔍 PROCURANDO REGISTROS DUPLICADOS NO BD (mesmo DATA+VALOR)...\n');

    // Buscar grupos com mesmo DATA+VALOR
    const duplicados = await pool.query(`
      SELECT
        data,
        valor,
        COUNT(*) as qtd,
        ARRAY_AGG(id ORDER BY id) as ids,
        ARRAY_AGG(id_transacao_banco ORDER BY id) as fitids,
        ARRAY_AGG(descricao_original ORDER BY id) as descricoes
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND data >= '2026-09-01'
        AND data <= '2026-09-14'
      GROUP BY data, valor
      HAVING COUNT(*) > 1
      ORDER BY data, valor
    `);

    if (duplicados.rows.length === 0) {
      console.log('✅ Nenhum registro duplicado encontrado!\n');
    } else {
      console.log(`❌ ENCONTRADOS ${duplicados.rows.length} GRUPO(S) COM DUPLICATAS:\n`);
      console.log('='.repeat(80) + '\n');

      duplicados.rows.forEach((dup, i) => {
        const dataF = dup.data.toISOString().split('T')[0];
        console.log(`${i+1}. Data: ${dataF} | Valor: R$ ${parseFloat(dup.valor).toFixed(2)} | Qtd: ${dup.qtd}\n`);

        for (let j = 0; j < dup.qtd; j++) {
          console.log(`   [${j+1}] ID: ${dup.ids[j]}`);
          console.log(`       FITID: ${dup.fitids[j]}`);
          console.log(`       Desc: ${dup.descricoes[j].substring(0, 70)}\n`);
        }

        console.log('');
      });

      console.log('='.repeat(80) + '\n');

      // Contar total de duplicatas (além da primeira ocorrência)
      const totalDuplicatas = duplicados.rows.reduce((sum, row) => sum + (row.qtd - 1), 0);
      console.log(`📊 Total de registros duplicados (extras): ${totalDuplicatas}\n`);
    }

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

encontrar();
