// ============================================================
// VERIFICAR STATUS DAS MENSAGENS DA FILA — V.260911162700
// ============================================================

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function verificarStatus() {
  try {
    // Buscar últimas mensagens da fila (últimos 50 registros)
    const result = await pool.query(`
      SELECT id, grupo_id, status, enviado_em, erro,
             LEFT(mensagem, 50) as mensagem_preview
      FROM public.wpp_fila_agenda
      ORDER BY id DESC
      LIMIT 50
    `);

    console.log(`\n📊 Últimas 50 mensagens da fila:\n`);
    console.log('ID    | Status    | Enviado em          | Grupo ID                      | Erro');
    console.log('------|-----------|---------------------|-------------------------------|---------------------');

    for (const row of result.rows) {
      const enviadoEm = row.enviado_em ? new Date(row.enviado_em).toLocaleString('pt-BR') : '-';
      const erro = row.erro ? row.erro.substring(0, 30) : '-';
      console.log(`${String(row.id).padEnd(5)} | ${row.status.padEnd(9)} | ${enviadoEm.padEnd(19)} | ${row.grupo_id} | ${erro}`);
    }

    // Resumo por status
    const resumo = await pool.query(`
      SELECT status, COUNT(*) as total
      FROM public.wpp_fila_agenda
      GROUP BY status
      ORDER BY status
    `);

    console.log(`\n📈 Resumo geral:\n`);
    for (const row of resumo.rows) {
      console.log(`${row.status}: ${row.total}`);
    }
    console.log('');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verificarStatus();
