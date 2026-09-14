// ============================================================
// EXECUTAR UPDATES MANUALMENTE
// V.2609141715
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function executarUpdates() {
  console.log('🔧 Atualizando dados bancários...\n');

  try {
    // 1. ALLMAX
    console.log('⏳ ALLMAX...');
    const r1 = await pool.query(`
      UPDATE bank_extratos
      SET
        agencia = '0001',
        agencia_dv = NULL,
        conta = '6327105',
        conta_dv = '0',
        tipo_conta = 'Conta de Pagamento',
        nome_banco = 'Asaas I.P S.A',
        codigo_banco = '461'
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND (agencia IS NULL OR conta IS NULL)
    `);
    console.log(`   ✅ ${r1.rowCount} registros atualizados\n`);

    // 2. IMOBEM
    console.log('⏳ IMOBEM...');
    const r2 = await pool.query(`
      UPDATE bank_extratos
      SET
        agencia = '0001',
        agencia_dv = NULL,
        conta = '6576593',
        conta_dv = '5',
        tipo_conta = 'Conta de Pagamento',
        nome_banco = 'Asaas I.P S.A',
        codigo_banco = '461'
      WHERE empresa = 'IMOBEM'
        AND banco = 'Asaas'
        AND (agencia IS NULL OR conta IS NULL)
    `);
    console.log(`   ✅ ${r2.rowCount} registros atualizados\n`);

    // 3. SUMMER
    console.log('⏳ SUMMER...');
    const r3 = await pool.query(`
      UPDATE bank_extratos
      SET
        agencia = '0001',
        agencia_dv = NULL,
        conta = '6327037',
        conta_dv = '5',
        tipo_conta = 'Conta de Pagamento',
        nome_banco = 'Asaas I.P S.A',
        codigo_banco = '461'
      WHERE empresa = 'SUMMER'
        AND banco = 'Asaas'
        AND (agencia IS NULL OR conta IS NULL)
    `);
    console.log(`   ✅ ${r3.rowCount} registros atualizados\n`);

    console.log(`📊 TOTAL: ${r1.rowCount + r2.rowCount + r3.rowCount} registros atualizados\n`);

    // Verificação
    console.log('🔍 VERIFICAÇÃO FINAL:\n');
    const check = await pool.query(`
      SELECT
        empresa,
        COUNT(*) as total,
        COUNT(CASE WHEN agencia IS NOT NULL THEN 1 END) as com_agencia,
        COUNT(CASE WHEN conta IS NOT NULL THEN 1 END) as com_conta,
        COUNT(CASE WHEN agencia IS NULL OR conta IS NULL THEN 1 END) as faltando
      FROM bank_extratos
      WHERE banco = 'Asaas'
      GROUP BY empresa
      ORDER BY empresa
    `);

    console.table(check.rows);

    console.log('\n✅ CONCLUÍDO!\n');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

executarUpdates();
