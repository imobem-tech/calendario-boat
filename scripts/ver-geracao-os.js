import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function verGeracaoOS() {
  try {
    console.log('🔍 Analisando geração de OS_Numero...\n');

    // 1. Ver últimos 10 OS criados
    const ultimos = await pool.query(`
      SELECT *
      FROM public."P_BOAT_9_OS"
      ORDER BY "OS_Numero" DESC
      LIMIT 10
    `);

    console.log('📊 Últimos 10 OS criados:');
    ultimos.rows.forEach((row, i) => {
      console.log(`\n${i+1}. OS_Numero: ${row.OS_Numero}`);
      console.log(`   OS_Dt: ${row.OS_Dt}`);
      console.log(`   Outras colunas:`, Object.keys(row).join(', '));
    });

    // 2. Verificar sequence
    const sequences = await pool.query(`
      SELECT *
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
    `);

    if (sequences.rows.length > 0) {
      console.log('\n🔢 Sequences encontradas:');
      sequences.rows.forEach(seq => {
        console.log(`   - ${seq.sequence_name}`);
      });
    }

    // 3. Mostrar TODAS as colunas da tabela OS
    const colunas = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'P_BOAT_9_OS'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 TODAS as colunas de P_BOAT_9_OS:');
    colunas.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
      if (col.column_default) {
        console.log(`     Default: ${col.column_default}`);
      }
    });

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verGeracaoOS();
