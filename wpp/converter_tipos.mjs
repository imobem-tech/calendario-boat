import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🔄 Convertendo tipos...\n');

try {
  // RECEITA → CREDITO
  const r1 = await pool.query("UPDATE bank_categorias SET tipo = 'CREDITO' WHERE tipo ILIKE 'receita'");
  console.log('✅ RECEITA → CREDITO:', r1.rowCount);

  // DESPESA → DEBITO
  const r2 = await pool.query("UPDATE bank_categorias SET tipo = 'DEBITO' WHERE tipo ILIKE 'despesa'");
  console.log('✅ DESPESA → DEBITO:', r2.rowCount);

  // TRANSFERENCIA → DEBITO
  const r3 = await pool.query("UPDATE bank_categorias SET tipo = 'DEBITO' WHERE tipo ILIKE 'transfer%'");
  console.log('✅ TRANSFERENCIA → DEBITO:', r3.rowCount);

  console.log('\n📊 Tipos atualizados:');
  const r = await pool.query('SELECT DISTINCT tipo, COUNT(*) FROM bank_categorias GROUP BY tipo ORDER BY tipo');
  console.table(r.rows);

  console.log('\n🎉 Conversão completa!');

} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
