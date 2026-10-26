import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function contar() {
  const result = await pool.query(`
    SELECT COUNT(*) as total
    FROM bank_extratos
    WHERE tipo_importacao = 'OFX'
      AND banco = 'Asaas'
      AND empresa = 'ALLMAX'
      AND (
        nome_origem IS NULL
        OR nome_origem = ''
        OR classificacao IS NULL
        OR classificacao = ''
        OR status = 'PENDENTE'
      )
  `);
  
  console.log(`\nRegistros PENDENTES: ${result.rows[0].total}\n`);
  await pool.end();
}

contar();
