// ============================================================
// MIGRAÇÃO: status_classificacao → status
// Data: 12/09/2026 23:15
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function migrateStatusColumn() {
  try {
    console.log('🔄 Iniciando migração de status_classificacao → status\n');

    // 1. Verificar valores existentes em status_classificacao
    console.log('📊 Verificando valores existentes...');
    const valores = await pool.query(`
      SELECT status_classificacao, COUNT(*) as total
      FROM bank_extratos
      WHERE status_classificacao IS NOT NULL
      GROUP BY status_classificacao
      ORDER BY total DESC
    `);

    if (valores.rows.length > 0) {
      console.log('\n📋 Valores em status_classificacao:');
      valores.rows.forEach(row => {
        console.log(`   - "${row.status_classificacao}": ${row.total} registros`);
      });
    } else {
      console.log('   ℹ️  Nenhum valor em status_classificacao (todos NULL)');
    }

    // 2. Contar total de registros
    const total = await pool.query(`SELECT COUNT(*) as total FROM bank_extratos`);
    console.log(`\n📊 Total de lançamentos: ${total.rows[0].total}`);

    // 3. Copiar dados de status_classificacao para status
    console.log('\n📝 Copiando dados para nova coluna status...');
    const result = await pool.query(`
      UPDATE bank_extratos
      SET status = status_classificacao
      WHERE status_classificacao IS NOT NULL
    `);

    console.log(`✅ ${result.rowCount} registros migrados!`);

    // 4. Verificar se a cópia foi bem-sucedida
    console.log('\n🔍 Verificando migração...');
    const verificacao = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IS NOT NULL) as com_status,
        COUNT(*) FILTER (WHERE status IS NULL) as sem_status,
        COUNT(*) as total
      FROM bank_extratos
    `);

    const stats = verificacao.rows[0];
    console.log(`   ✅ Com status: ${stats.com_status}`);
    console.log(`   ⚪ Sem status: ${stats.sem_status}`);
    console.log(`   📊 Total: ${stats.total}`);

    // 5. Remover coluna antiga
    console.log('\n🗑️  Removendo coluna status_classificacao...');
    await pool.query(`
      ALTER TABLE bank_extratos
      DROP COLUMN status_classificacao
    `);

    console.log('✅ Coluna status_classificacao removida!');

    // 6. Verificação final
    console.log('\n✅ Migração concluída com sucesso!\n');
    console.log('📋 Resumo:');
    console.log(`   - Dados migrados: ${result.rowCount} registros`);
    console.log(`   - Coluna antiga: REMOVIDA`);
    console.log(`   - Coluna nova: status (ativa)`);
    console.log('');

  } catch (err) {
    console.error('\n❌ Erro na migração:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateStatusColumn();
