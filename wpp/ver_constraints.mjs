import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('📊 Constraints da tabela bank_categorias:\n');

try {
  const r = await pool.query(`
    SELECT
      conname as constraint_name,
      contype as constraint_type,
      pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = 'bank_categorias'::regclass
    ORDER BY contype, conname
  `);

  console.table(r.rows);

  console.log('\n📋 Categorias existentes:\n');
  const cats = await pool.query('SELECT empresa, nome, tipo FROM bank_categorias ORDER BY empresa, nome');
  console.table(cats.rows);

} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
