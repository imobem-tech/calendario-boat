import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  // Contar registros dias 01-10
  const result = await pool.query(`
    SELECT COUNT(*) as total, data
    FROM bank_extratos
    WHERE empresa = 'ALLMAX'
      AND banco = 'Asaas'
      AND data >= '2026-09-01'
      AND data <= '2026-09-10'
    GROUP BY data
    ORDER BY data
  `);

  console.log('\n📊 REGISTROS DIAS 01-10 NO BD:\n');

  let total = 0;
  result.rows.forEach(row => {
    const dataF = row.data.toISOString().split('T')[0];
    const qtd = parseInt(row.total);
    total += qtd;
    console.log(`  ${dataF}: ${qtd.toString().padStart(3)} registros`);
  });

  console.log(`\n  TOTAL DIAS 01-10: ${total}`);

  // Buscar info sobre a constraint
  const constraint = await pool.query(`
    SELECT
      con.conname AS constraint_name,
      ARRAY_AGG(att.attname ORDER BY att.attnum) AS column_names
    FROM pg_constraint con
    JOIN pg_class rel ON con.conrelid = rel.oid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
    WHERE con.conname = 'uk_extrato'
      AND nsp.nspname = 'public'
    GROUP BY con.conname
  `);

  if (constraint.rows.length > 0) {
    console.log(`\n🔍 CONSTRAINT uk_extrato:\n`);
    console.log(`  Campos: ${constraint.rows[0].column_names.join(', ')}`);
  }

  await pool.end();
}

check();
