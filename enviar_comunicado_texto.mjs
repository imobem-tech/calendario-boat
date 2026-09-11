// ============================================================
// ENVIAR COMUNICADO TEXTO PARA GRUPOS 576, 573, 586 — V.260911164500
// ============================================================

import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

// Ler o comunicado do arquivo
const COMUNICADO = `*COMUNICADO AOS COTISTAS*

Prezados Senhores,

Informamos que na reposição do estoque de combustível foi constado a redução do preço do combustível de propulsão (diesel), motivo pelo qual foi ajustado a *menor do valor* da fração de hora/motor, de *R$ 35,70* para *R$ 32,97*, por décimo de hora.


Atenciosamente,

Palmas/TO, 11 de setembro de 2026

*ALLMAX Gestão de Cotas Náuticas*`;

async function enviarComunicado() {
  try {
    const grupos = await pool.query(`
      SELECT grupowppid, nomegrupowpp, pb, cota
      FROM public.wpp_grupos_agenda
      WHERE pb IN ('576', '573', '586')
      ORDER BY pb, cota
    `);

    console.log(`\n📢 Enviando comunicado para ${grupos.rowCount} grupos...\n`);

    let inseridos = 0;

    for (const grupo of grupos.rows) {
      try {
        await pool.query(`
          INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
          VALUES ($1, $2, 'pendente')
        `, [grupo.grupowppid, COMUNICADO]);

        inseridos++;
        console.log(`✅ ${grupo.pb}-${grupo.cota} ${grupo.nomegrupowpp}`);
      } catch (err) {
        console.error(`❌ Erro ${grupo.nomegrupowpp}:`, err.message);
      }
    }

    console.log(`\n✅ Comunicado inserido na fila: ${inseridos}/${grupos.rowCount} grupos\n`);
    console.log('🤖 O bot processará automaticamente e enviará as mensagens.\n');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

enviarComunicado();
