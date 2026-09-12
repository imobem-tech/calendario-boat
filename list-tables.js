import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('📋 Listando todas as tabelas do banco:\n');

const result = await pool.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

console.log(`Total: ${result.rows.length} tabelas\n`);

result.rows.forEach(r => {
  console.log(`  - ${r.table_name}`);
});

console.log('\n\nProcurando tabelas relacionadas a "custo", "categoria", "tipo":\n');

const filtered = result.rows.filter(r =>
  r.table_name.toLowerCase().includes('custo') ||
  r.table_name.toLowerCase().includes('categoria') ||
  r.table_name.toLowerCase().includes('tipo') ||
  r.table_name.toLowerCase().includes('class')
);

filtered.forEach(r => {
  console.log(`  ✓ ${r.table_name}`);
});

await pool.end();
