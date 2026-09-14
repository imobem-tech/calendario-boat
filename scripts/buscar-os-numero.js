import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function buscarOSNumero() {
  try {
    console.log('🔍 Buscando informações sobre OS_Numero...\n');

    // 1. Listar TODAS as colunas da tabela
    const todasColunas = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'P_BOAT_z_10_Saida_Emb'
      ORDER BY ordinal_position
    `);

    console.log('📋 TODAS as colunas da tabela P_BOAT_z_10_Saida_Emb:');
    todasColunas.rows.forEach((col, i) => {
      console.log(`   ${i+1}. ${col.column_name} (${col.data_type})`);
    });

    // 2. Destacar colunas com "OS"
    const colunasOS = todasColunas.rows.filter(col => col.column_name.toLowerCase().includes('os'));
    if (colunasOS.length > 0) {
      console.log('\n🎯 Colunas com "OS":');
      colunasOS.forEach(col => {
        console.log(`   ✅ ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('\n⚠️ Nenhuma coluna com "OS" encontrada');
    }

    // 3. Ver 1 exemplo de registro
    const exemplo = await pool.query(`
      SELECT *
      FROM public."P_BOAT_z_10_Saida_Emb"
      LIMIT 1
    `);

    if (exemplo.rows.length > 0) {
      console.log('\n📄 Exemplo de registro (primeiras 10 colunas):');
      const row = exemplo.rows[0];
      Object.keys(row).slice(0, 15).forEach(key => {
        console.log(`   ${key}: ${row[key]}`);
      });
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

buscarOSNumero();
