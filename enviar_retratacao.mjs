// ============================================================
// ENVIAR RETRATAÇÃO PARA OS 42 GRUPOS — V.260911163800
// ============================================================

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

const MENSAGEM_RETRATACAO = `⚠️ *DESCONSIDERAR MENSAGEM ANTERIOR*

A mensagem anterior foi enviada com erro técnico.

Por favor, *DESCONSIDERAR* o texto enviado há pouco.

Em breve enviaremos a mensagem correta.

Pedimos desculpas pelo transtorno.

*ALLMAX Gestão de Cotas Náuticas*`;

async function enviarRetratacao() {
  try {
    const grupos = await pool.query(`
      SELECT grupowppid, nomegrupowpp, pb, cota
      FROM public.wpp_grupos_agenda
      WHERE pb IN ('576', '573', '586')
      ORDER BY pb, cota
    `);

    console.log(`\n📢 Enviando retratação para ${grupos.rowCount} grupos...\n`);

    let inseridos = 0;

    for (const grupo of grupos.rows) {
      try {
        await pool.query(`
          INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
          VALUES ($1, $2, 'pendente')
        `, [grupo.grupowppid, MENSAGEM_RETRATACAO]);

        inseridos++;
        console.log(`✅ ${grupo.pb}-${grupo.cota} ${grupo.nomegrupowpp}`);
      } catch (err) {
        console.error(`❌ Erro ${grupo.nomegrupowpp}:`, err.message);
      }
    }

    console.log(`\n✅ Retratação inserida na fila: ${inseridos}/${grupos.rowCount} grupos\n`);

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

enviarRetratacao();
