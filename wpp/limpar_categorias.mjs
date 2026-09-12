import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('⚠️  LIMPEZA TOTAL DA TABELA bank_categorias\n');
console.log('=' .repeat(60));

try {
  // 1. MOSTRAR O QUE VAI SER DELETADO
  console.log('\n📊 CATEGORIAS ATUAIS:\n');
  const antes = await pool.query('SELECT empresa, COUNT(*) as total FROM bank_categorias GROUP BY empresa ORDER BY empresa');
  console.table(antes.rows);

  const total = await pool.query('SELECT COUNT(*) as total FROM bank_categorias');
  console.log(`\n⚠️  TOTAL: ${total.rows[0].total} categorias SERÃO DELETADAS!\n`);

  // 2. CRIAR BACKUP
  const dataHora = new Date().toISOString().replace(/[:.T-]/g, '_').slice(0, 19);
  const nomeBackup = `bank_categorias_backup_${dataHora}`;

  console.log(`💾 Criando backup: ${nomeBackup}...\n`);

  await pool.query(`
    CREATE TABLE ${nomeBackup} AS
    SELECT * FROM bank_categorias
  `);

  const backupCount = await pool.query(`SELECT COUNT(*) as total FROM ${nomeBackup}`);
  console.log(`✅ Backup criado: ${backupCount.rows[0].total} registros salvos\n`);

  // 3. DELETAR TUDO
  console.log('🗑️  Deletando TODAS as categorias...\n');

  const deleted = await pool.query('DELETE FROM bank_categorias');
  console.log(`✅ ${deleted.rowCount} categorias DELETADAS!\n`);

  // 4. VERIFICAR QUE ESTÁ VAZIO
  const depois = await pool.query('SELECT COUNT(*) as total FROM bank_categorias');
  console.log(`📊 Tabela agora: ${depois.rows[0].total} categorias\n`);

  console.log('=' .repeat(60));
  console.log('✅ LIMPEZA CONCLUÍDA COM SUCESSO!\n');
  console.log(`💾 Backup disponível em: ${nomeBackup}`);
  console.log('📝 Agora você pode cadastrar categorias do zero!\n');

  // 5. MOSTRAR COMO RESTAURAR (caso necessário)
  console.log('⚠️  Para RESTAURAR o backup (se precisar):');
  console.log(`   INSERT INTO bank_categorias SELECT * FROM ${nomeBackup};\n`);

} catch (e) {
  console.error('❌ ERRO:', e.message);
  console.error('\n⚠️  Backup pode ter sido criado, mas delete falhou.');
  console.error('   Verifique antes de tentar novamente.\n');
} finally {
  await pool.end();
}
