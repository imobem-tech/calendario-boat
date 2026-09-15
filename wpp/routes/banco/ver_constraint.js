import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const {Pool} = pkg;
const p = new Pool({connectionString: process.env.DATABASE_URL});

p.query(`
  SELECT constraint_name, column_name, ordinal_position
  FROM information_schema.key_column_usage
  WHERE table_name = 'bank_extratos'
    AND constraint_name = 'uk_extrato'
  ORDER BY ordinal_position
`).then(r => {
  console.log('\n📌 Constraint uk_extrato:');
  r.rows.forEach(x => console.log(`  - ${x.column_name}`));
  console.log('');
}).finally(() => p.end());
