import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🔧 Removendo constraint UNIQUE(nome) errado...\n');

try {
  // Remover constraint que impede duplicar nome entre empresas
  await pool.query('ALTER TABLE bank_categorias DROP CONSTRAINT IF EXISTS categorias_nome_key');
  console.log('✅ Constraint categorias_nome_key REMOVIDO!');

  console.log('\n📊 Constraints restantes:\n');
  const r = await pool.query(`
    SELECT
      conname as constraint_name,
      pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = 'bank_categorias'::regclass
    ORDER BY conname
  `);

  console.table(r.rows);

  console.log('\n✅ Agora você pode ter a mesma categoria em empresas diferentes!');
  console.log('✅ Exemplo: ALLMAX "Mensalidade" + IMOBEM "Mensalidade"');

} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
