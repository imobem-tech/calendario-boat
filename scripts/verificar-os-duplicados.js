import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function verificarDuplicados() {
  try {
    console.log('🔍 Verificando OS_Numero duplicados...\n');

    // Buscar duplicações
    const duplicados = await pool.query(`
      SELECT 
        "OS_Numero",
        COUNT(*) as qtd,
        STRING_AGG("Código"::text, ', ') as codigos
      FROM "P_BOAT_9_OS"
      WHERE "OS_Numero" IS NOT NULL
      GROUP BY "OS_Numero"
      HAVING COUNT(*) > 1
      ORDER BY "OS_Numero"
    `);

    if (duplicados.rows.length > 0) {
      console.log('❌ OS_Numero DUPLICADOS encontrados:\n');
      duplicados.rows.forEach(row => {
        console.log(`OS_Numero: ${row.OS_Numero} → Aparece ${row.qtd}x (Códigos: ${row.codigos})`);
      });
      console.log(`\nTotal: ${duplicados.rows.length} números duplicados`);
    } else {
      console.log('✅ Nenhuma duplicação encontrada!');
    }

    // Ver padrão OS_Numero vs Código
    console.log('\n📊 Comparação OS_Numero vs Código (últimos 20):');
    const comparacao = await pool.query(`
      SELECT "Código", "OS_Numero", "Tipo", "OS_Dt"
      FROM "P_BOAT_9_OS"
      ORDER BY "Código" DESC
      LIMIT 20
    `);

    comparacao.rows.forEach(row => {
      const match = row.Código === row.OS_Numero ? '✅' : '❌';
      console.log(`${match} Código: ${row.Código} | OS_Numero: ${row.OS_Numero} | Tipo: ${row.Tipo || '-'}`);
    });

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verificarDuplicados();
