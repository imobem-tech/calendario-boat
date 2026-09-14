// ============================================================
// SCRIPT ÚNICO: Preencher agencia e conta em registros existentes
// Executar UMA VEZ e depois deletar
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function preencherContasExistentes() {
  console.log('🔄 Iniciando preenchimento de agência e conta...\n');

  try {
    // ============================================================
    // 1. ALLMAX
    // ============================================================
    console.log('📊 Atualizando ALLMAX...');
    const resultAllmax = await pool.query(`
      UPDATE bank_extratos
      SET
        agencia = '0001',
        agencia_dv = NULL,
        conta = '6327105',
        conta_dv = '0'
      WHERE empresa = 'ALLMAX'
        AND (agencia IS NULL OR conta IS NULL)
      RETURNING id
    `);
    console.log(`✅ ALLMAX: ${resultAllmax.rowCount} registros atualizados\n`);

    // ============================================================
    // 2. SUMMER
    // ============================================================
    console.log('📊 Atualizando SUMMER...');
    const resultSummer = await pool.query(`
      UPDATE bank_extratos
      SET
        agencia = '0001',
        agencia_dv = NULL,
        conta = '6327037',
        conta_dv = '5'
      WHERE empresa = 'SUMMER'
        AND (agencia IS NULL OR conta IS NULL)
      RETURNING id
    `);
    console.log(`✅ SUMMER: ${resultSummer.rowCount} registros atualizados\n`);

    // ============================================================
    // 3. IMOBEM
    // ============================================================
    console.log('📊 Atualizando IMOBEM...');
    const resultImobem = await pool.query(`
      UPDATE bank_extratos
      SET
        agencia = '0001',
        agencia_dv = NULL,
        conta = '6576593',
        conta_dv = '5'
      WHERE empresa = 'IMOBEM'
        AND (agencia IS NULL OR conta IS NULL)
      RETURNING id
    `);
    console.log(`✅ IMOBEM: ${resultImobem.rowCount} registros atualizados\n`);

    // ============================================================
    // 4. IMOBAN (pendente - dados temporários)
    // ============================================================
    console.log('📊 Atualizando IMOBAN (temporário)...');
    const resultImoban = await pool.query(`
      UPDATE bank_extratos
      SET
        agencia = '0001',
        agencia_dv = NULL,
        conta = '0000000',
        conta_dv = '0'
      WHERE empresa = 'IMOBAN'
        AND (agencia IS NULL OR conta IS NULL)
      RETURNING id
    `);
    console.log(`✅ IMOBAN: ${resultImoban.rowCount} registros atualizados\n`);

    // ============================================================
    // RESUMO
    // ============================================================
    const totalAtualizado =
      resultAllmax.rowCount +
      resultSummer.rowCount +
      resultImobem.rowCount +
      resultImoban.rowCount;

    console.log('═'.repeat(60));
    console.log('✅ ATUALIZAÇÃO CONCLUÍDA!');
    console.log('═'.repeat(60));
    console.log(`Total de registros atualizados: ${totalAtualizado}`);
    console.log('');
    console.log('Detalhes:');
    console.log(`  ALLMAX: ${resultAllmax.rowCount} registros`);
    console.log(`  SUMMER: ${resultSummer.rowCount} registros`);
    console.log(`  IMOBEM: ${resultImobem.rowCount} registros`);
    console.log(`  IMOBAN: ${resultImoban.rowCount} registros`);
    console.log('');
    console.log('⚠️  ATENÇÃO: Este script deve ser executado apenas UMA VEZ!');
    console.log('   Depois de executar, DELETAR este arquivo.');
    console.log('═'.repeat(60));

    return {
      sucesso: true,
      total: totalAtualizado,
      detalhes: {
        allmax: resultAllmax.rowCount,
        summer: resultSummer.rowCount,
        imobem: resultImobem.rowCount,
        imoban: resultImoban.rowCount
      }
    };

  } catch (err) {
    console.error('❌ Erro ao preencher contas:', err);
    throw err;
  }
}

// Exportar para uso em endpoint
export { preencherContasExistentes };

// ============================================================
// FIM
// ============================================================
