import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function buscarTabelaOS() {
  try {
    console.log('🔍 Procurando tabelas com "OS" ou "ordem"...\n');

    // Buscar tabelas
    const tabelas = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (
          table_name ILIKE '%os%'
          OR table_name ILIKE '%ordem%'
          OR table_name ILIKE '%servico%'
        )
      ORDER BY table_name
    `);

    if (tabelas.rows.length > 0) {
      console.log('📋 Tabelas encontradas:');
      tabelas.rows.forEach((t, i) => {
        console.log(`   ${i+1}. ${t.table_name}`);
      });
    } else {
      console.log('⚠️ Nenhuma tabela com "OS" ou "ordem" encontrada');
    }

    // Procurar colunas com OS em todas as tabelas
    console.log('\n🔍 Procurando colunas com "OS" em TODAS as tabelas...\n');
    
    const colunas = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name ILIKE '%os%'
      ORDER BY table_name, ordinal_position
    `);

    if (colunas.rows.length > 0) {
      console.log('🎯 Colunas com "OS":');
      colunas.rows.forEach(col => {
        console.log(`   ✅ ${col.table_name}.${col.column_name} (${col.data_type})`);
      });
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

buscarTabelaOS();
