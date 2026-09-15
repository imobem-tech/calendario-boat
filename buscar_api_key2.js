import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const data = await pool.query(`
      SELECT 
        "Codigo",
        "Empresa",
        "Descrição",
        "API_Key",
        "Centro_Custo_banco"
      FROM "Centros_Custos"
      WHERE "API_Key" IS NOT NULL
      ORDER BY "Empresa"
    `);

    console.log('\n🔑 API KEYS ENCONTRADAS:\n');
    
    data.rows.forEach(row => {
      console.log(`${row.Descrição || 'Empresa ' + row.Empresa}:`);
      console.log(`  Codigo: ${row.Codigo}`);
      console.log(`  Empresa: ${row.Empresa}`);
      console.log(`  API_Key: ${row.API_Key ? row.API_Key.substring(0, 20) + '...' : 'N/A'}`);
      console.log(`  Centro_Custo_banco: ${row.Centro_Custo_banco || 'N/A'}\n`);
    });

    // Buscar especificamente ALLMAX
    const allmax = await pool.query(`
      SELECT "API_Key" 
      FROM "Centros_Custos"
      WHERE "Descrição" ILIKE '%ALLMAX%'
        AND "API_Key" IS NOT NULL
      LIMIT 1
    `);

    if (allmax.rows.length > 0) {
      console.log('✅ API KEY DA ALLMAX ENCONTRADA!\n');
      console.log(`Chave: ${allmax.rows[0].API_Key.substring(0, 30)}...\n`);
    } else {
      console.log('❌ API KEY DA ALLMAX não encontrada\n');
    }

    await pool.end();
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();
