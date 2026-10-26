import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function buscar() {
  // Total
  const total = await pool.query('SELECT COUNT(*) FROM wpp_grupos_agenda');
  console.log('\n📊 Total de grupos no banco:', total.rows[0].count);

  // Grupos sem PB (administrativos)
  console.log('\n🔍 Grupos SEM PB/Cota (possivelmente administrativos):\n');
  const semPB = await pool.query(`
    SELECT grupowppid, nomegrupowpp, pb, cota
    FROM wpp_grupos_agenda
    WHERE pb IS NULL
    ORDER BY nomegrupowpp
  `);

  if (semPB.rows.length > 0) {
    semPB.rows.forEach(g => {
      console.log(`📱 ${g.nomegrupowpp}`);
      console.log(`   JID: ${g.grupowppid}\n`);
    });
  } else {
    console.log('❌ Nenhum grupo sem PB encontrado\n');
  }

  await pool.end();
}

buscar().catch(console.error);
