// ============================================================
// LIMPAR FILA DE MENSAGENS — V.260911162500
// ============================================================

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function limparFila() {
  try {
    // Primeiro, mostrar quantas mensagens pendentes existem
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM public.wpp_fila_agenda
      WHERE status = 'pendente'
    `);

    const total = parseInt(countResult.rows[0].total);
    console.log(`\n🗑️  Encontradas ${total} mensagens pendentes na fila\n`);

    if (total === 0) {
      console.log('✅ Fila já está vazia!\n');
      return;
    }

    // Deletar todas as mensagens pendentes
    const deleteResult = await pool.query(`
      DELETE FROM public.wpp_fila_agenda
      WHERE status = 'pendente'
    `);

    console.log(`✅ ${deleteResult.rowCount} mensagens removidas da fila\n`);

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

limparFila();
