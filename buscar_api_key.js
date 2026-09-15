import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // Buscar estrutura da tabela
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name ILIKE '%centro%'
      ORDER BY table_name
    `);

    console.log('\n📊 TABELAS COM "CENTRO" NO NOME:\n');
    tables.rows.forEach(t => console.log(`  - ${t.table_name}`));

    if (tables.rows.length > 0) {
      const tableName = tables.rows[0].table_name;
      
      console.log(`\n📋 COLUNAS DA TABELA "${tableName}":\n`);
      
      const cols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      cols.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

      console.log(`\n🔍 DADOS DA TABELA:\n`);
      
      const data = await pool.query(`SELECT * FROM ${tableName} LIMIT 5`);
      console.log(JSON.stringify(data.rows, null, 2));
    }

    await pool.end();
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();
