// Verificar grupo E4
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔍 VERIFICANDO GRUPOS PB 627\n');

    const grupos = await pool.query(`
      SELECT pb, cota, grupowppid, nomegrupowpp
      FROM wpp_grupos_agenda
      WHERE pb = 627
      ORDER BY cota
    `);

    console.log('PB  | Cota | ID WhatsApp              | Nome');
    console.log('----|------|--------------------------|---------------------------');
    grupos.rows.forEach(g => {
      console.log(
        `${String(g.pb).padEnd(3)} | ` +
        `${(g.cota || '?').padEnd(4)} | ` +
        `${(g.grupowppid || '').substring(0, 24).padEnd(24)} | ` +
        `${(g.nomegrupowpp || '').substring(0, 25)}`
      );
    });

    console.log(`\nTotal: ${grupos.rows.length} grupo(s)`);

    const e4 = grupos.rows.filter(g => g.cota === 'E4');
    if (e4.length === 0) {
      console.log('\n❌ E4 NÃO ENCONTRADO!');
    } else {
      console.log(`\n✅ E4 encontrado: ${e4.length} grupo(s)`);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await pool.end();
  }
})();
