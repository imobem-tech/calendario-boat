// ============================================================
// verificar_proximo_codigo.js — V.2610261100
// Verifica qual será o próximo código disponível
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(MAX("Codigo"), 0) + 1 as proximo_codigo
      FROM "Contas_Receber"
      WHERE "Empresa" = 8
    `);

    console.log('\n📊 PRÓXIMO CÓDIGO DISPONÍVEL:\n');
    console.log(`   Empresa: 8 (ALLMAX)`);
    console.log(`   Próximo código: ${rows[0].proximo_codigo}`);
    console.log('');

    await pool.end();
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
