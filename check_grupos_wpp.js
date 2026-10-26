// Verificar grupos WhatsApp duplicados
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔍 GRUPOS WHATSAPP - PB 627\n');

    const grupos = await pool.query(`
      SELECT
        pb,
        cota,
        grupowppid,
        nomegrupowpp,
        COUNT(*) OVER (PARTITION BY pb, cota) as duplicados
      FROM wpp_grupos_agenda
      WHERE pb = 627
      ORDER BY cota, grupowppid
    `);

    console.log('PB  | Cota | ID WhatsApp        | Nome                     | Dupl?');
    console.log('----|------|--------------------|--------------------------|------');
    grupos.rows.forEach(g => {
      const dup = g.duplicados > 1 ? ` ⚠️ ${g.duplicados}x` : '';
      console.log(
        `${String(g.pb).padEnd(3)} | ` +
        `${(g.cota || '?').padEnd(4)} | ` +
        `${(g.grupowppid || '').substring(0, 18).padEnd(18)} | ` +
        `${(g.nomegrupowpp || '').substring(0, 24).padEnd(24)} | ` +
        `${dup}`
      );
    });

    const duplicados = grupos.rows.filter(g => g.duplicados > 1);
    if (duplicados.length > 0) {
      console.log('\n🚨 GRUPOS DUPLICADOS ENCONTRADOS!');
      const cotas = [...new Set(duplicados.map(g => g.cota))];
      console.log(`Cotas afetadas: ${cotas.join(', ')}`);
    } else {
      console.log('\n✅ Nenhum grupo duplicado');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await pool.end();
  }
})();
