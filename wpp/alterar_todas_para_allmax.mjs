import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🔄 Alterando empresa TODAS → ALLMAX...\n');

try {
  // Mostrar categorias que serão alteradas
  console.log('📋 Categorias com empresa=TODAS:\n');
  const antes = await pool.query("SELECT id, nome, tipo, empresa FROM bank_categorias WHERE empresa = 'TODAS' ORDER BY nome");
  console.table(antes.rows);

  console.log(`\n🔄 Total a alterar: ${antes.rows.length} categorias\n`);

  // Alterar TODAS → ALLMAX
  const result = await pool.query("UPDATE bank_categorias SET empresa = 'ALLMAX' WHERE empresa = 'TODAS'");

  console.log(`✅ ${result.rowCount} categorias alteradas!\n`);

  // Mostrar resultado
  console.log('📊 Verificando alteração:\n');
  const depois = await pool.query("SELECT COUNT(*) as total, empresa FROM bank_categorias GROUP BY empresa ORDER BY empresa");
  console.table(depois.rows);

  console.log('\n✅ Alteração concluída com sucesso!');

} catch (e) {
  console.error('❌ Erro:', e.message);
  console.error(e);
} finally {
  await pool.end();
}
