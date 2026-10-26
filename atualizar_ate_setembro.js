// V.261001143500
// Script para atualizar TODOS os registros até 30/09/2026 para OK
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function atualizarAteSetembro() {
  try {
    // 1. Verificar o que será atualizado
    const verificacao = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendentes,
        COUNT(CASE WHEN status != 'OK' OR status IS NULL THEN 1 END) as nao_ok,
        COUNT(CASE WHEN classificacao IS NULL THEN 1 END) as sem_classificacao,
        COUNT(CASE WHEN tipo = 'DEBITO' AND classificacao IS NULL THEN 1 END) as debitos_sem_class,
        COUNT(CASE WHEN tipo = 'CREDITO' AND classificacao IS NULL THEN 1 END) as creditos_sem_class,
        MIN(data) as data_min,
        MAX(data) as data_max
      FROM bank_extratos
      WHERE data <= '2026-09-30'
    `);

    console.log('=== REGISTROS QUE SERÃO ATUALIZADOS (<= 30/09/2026) ===\n');
    console.log(`Total de registros: ${verificacao.rows[0].total}`);
    console.log(`  - Com status PENDENTE: ${verificacao.rows[0].pendentes}`);
    console.log(`  - Status diferente de OK: ${verificacao.rows[0].nao_ok}`);
    console.log(`  - Sem classificação: ${verificacao.rows[0].sem_classificacao}`);
    console.log(`    • DÉBITOS sem classificação: ${verificacao.rows[0].debitos_sem_class}`);
    console.log(`    • CRÉDITOS sem classificação: ${verificacao.rows[0].creditos_sem_class}`);
    console.log(`  - Período: ${verificacao.rows[0].data_min} a ${verificacao.rows[0].data_max}\n`);

    console.log('=== INICIANDO ATUALIZAÇÃO ===\n');

    // 2. Atualizar DÉBITOS sem classificação
    const updateDebitos = await pool.query(`
      UPDATE bank_extratos
      SET
        classificacao = COALESCE(classificacao, '38'),
        status = 'OK',
        classificado_em = COALESCE(classificado_em, NOW()),
        classificado_por = COALESCE(classificado_por, 'SCRIPT_FECHAMENTO_SET2026')
      WHERE data <= '2026-09-30'
        AND tipo = 'DEBITO'
        AND (status != 'OK' OR classificacao IS NULL OR status IS NULL)
      RETURNING id
    `);

    console.log(`✓ DÉBITOS atualizados: ${updateDebitos.rowCount} registros`);

    // 3. Atualizar CRÉDITOS sem classificação
    const updateCreditos = await pool.query(`
      UPDATE bank_extratos
      SET
        classificacao = COALESCE(classificacao, '37'),
        status = 'OK',
        classificado_em = COALESCE(classificado_em, NOW()),
        classificado_por = COALESCE(classificado_por, 'SCRIPT_FECHAMENTO_SET2026')
      WHERE data <= '2026-09-30'
        AND tipo = 'CREDITO'
        AND (status != 'OK' OR classificacao IS NULL OR status IS NULL)
      RETURNING id
    `);

    console.log(`✓ CRÉDITOS atualizados: ${updateCreditos.rowCount} registros`);

    // 4. Atualizar registros sem tipo (se houver)
    const updateSemTipo = await pool.query(`
      SELECT COUNT(*) as total
      FROM bank_extratos
      WHERE data <= '2026-09-30'
        AND (tipo IS NULL OR tipo NOT IN ('DEBITO', 'CREDITO'))
        AND (status != 'OK' OR status IS NULL)
    `);

    if (parseInt(updateSemTipo.rows[0].total) > 0) {
      console.log(`\n⚠️  ATENÇÃO: ${updateSemTipo.rows[0].total} registros SEM TIPO definido.`);
      console.log('   Estes precisam ter o campo "tipo" definido manualmente.\n');
    }

    // 5. Verificação final
    const verificacaoFinal = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'OK' THEN 1 END) as ok,
        COUNT(CASE WHEN status != 'OK' OR status IS NULL THEN 1 END) as nao_ok,
        COUNT(CASE WHEN classificacao IS NULL THEN 1 END) as sem_class
      FROM bank_extratos
      WHERE data <= '2026-09-30'
    `);

    console.log('\n=== VERIFICAÇÃO FINAL (<= 30/09/2026) ===\n');
    console.log(`Total de registros: ${verificacaoFinal.rows[0].total}`);
    console.log(`  ✓ Status OK: ${verificacaoFinal.rows[0].ok}`);
    console.log(`  ⚠ Status diferente de OK: ${verificacaoFinal.rows[0].nao_ok}`);
    console.log(`  ⚠ Sem classificação: ${verificacaoFinal.rows[0].sem_class}\n`);

    console.log('=== ATUALIZAÇÃO CONCLUÍDA ===');
    console.log(`Total processado: ${updateDebitos.rowCount + updateCreditos.rowCount} registros`);
    console.log('\n✅ A partir de 01/10/2026, todos os lançamentos serão controlados em tempo real!\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Erro ao atualizar:', error);
    await pool.end();
    process.exit(1);
  }
}

atualizarAteSetembro();
