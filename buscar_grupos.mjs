// ============================================================
// BUSCAR GRUPOS DAS EMBARCAÇÕES 576, 573, 586 — V.260911154800
// ============================================================

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function buscarGrupos() {
  try {
    const result = await pool.query(`
      SELECT grupowppid, nomegrupowpp, pb, cota
      FROM public.wpp_grupos_agenda
      WHERE pb IN ('576', '573', '586')
      ORDER BY pb, cota
    `);

    console.log('\n📱 GRUPOS ENCONTRADOS:\n');
    console.log('PB   | Cota | Grupo ID                      | Nome do Grupo');
    console.log('-----|------|-------------------------------|----------------------------------');

    for (const row of result.rows) {
      const cota = row.cota || '(geral)';
      console.log(`${row.pb} | ${cota.padEnd(4)} | ${row.grupowppid} | ${row.nomegrupowpp}`);
    }

    console.log(`\nTotal: ${result.rowCount} grupo(s)\n`);

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

buscarGrupos();
