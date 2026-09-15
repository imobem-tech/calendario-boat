import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const r = await pool.query(`
      SELECT 
        id,
        data,
        valor,
        descricao_original,
        nome_origem,
        cpf_cnpj_origem
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND data >= '2026-09-11'
      ORDER BY data, id
      LIMIT 15
    `);

    console.log('\n📊 REGISTROS NO BD (com nomes):\n');

    r.rows.forEach((row, i) => {
      const dataF = row.data.toISOString().split('T')[0];
      console.log(`${(i+1).toString().padStart(2)}. [${dataF}] R$ ${row.valor.toString().padStart(10)}`);
      console.log(`    Desc: ${row.descricao_original.substring(0, 60)}`);
      console.log(`    Nome: ${row.nome_origem || '(VAZIO)'}`);
      console.log(`    CPF:  ${row.cpf_cnpj_origem || '(VAZIO)'}\n`);
    });

    await pool.end();
  } catch (err) {
    console.error('❌', err.message);
  }
})();
