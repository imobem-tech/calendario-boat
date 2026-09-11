// ============================================================
// VERIFICAR ERROS NA FILA — V.260911163000
// ============================================================

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function verificarErros() {
  try {
    // Buscar mensagens com erro
    const result = await pool.query(`
      SELECT id, grupo_id, status, erro, enviado_em,
             LEFT(mensagem, 100) as mensagem_preview
      FROM public.wpp_fila_agenda
      WHERE status = 'erro'
      ORDER BY id DESC
      LIMIT 20
    `);

    console.log(`\n❌ Mensagens com ERRO (${result.rowCount}):\n`);

    if (result.rowCount === 0) {
      console.log('✅ Nenhuma mensagem com erro!\n');
    } else {
      for (const row of result.rows) {
        console.log(`ID: ${row.id}`);
        console.log(`Grupo: ${row.grupo_id}`);
        console.log(`Erro: ${row.erro}`);
        console.log(`Preview: ${row.mensagem_preview}`);
        console.log('─'.repeat(80));
      }
    }

    // Buscar as 42 mensagens que acabamos de enviar (IDs 1437-1478)
    const ultimasResult = await pool.query(`
      SELECT id, grupo_id, status, LEFT(mensagem, 80) as msg_preview
      FROM public.wpp_fila_agenda
      WHERE id >= 1437 AND id <= 1478
      ORDER BY id
    `);

    console.log(`\n📊 Status das 42 mensagens enviadas (IDs 1437-1478):\n`);
    let enviadas = 0, erros = 0;

    for (const row of ultimasResult.rows) {
      if (row.status === 'enviado') enviadas++;
      if (row.status === 'erro') erros++;
    }

    console.log(`✅ Enviadas: ${enviadas}`);
    console.log(`❌ Erros: ${erros}`);
    console.log(`\nTotal: ${ultimasResult.rowCount}\n`);

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verificarErros();
