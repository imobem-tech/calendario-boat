// ============================================================
// PRODUÇÃO - Enviar comunicado para todos os grupos ativos
// V.2606061350
// ============================================================
import pkg from 'pg';
const { Pool } = pkg;
import { MENSAGEM_1_APRESENTACAO, MENSAGEM_2_FACILIDADES, MENSAGEM_3_GUIA, CONFIG_ENVIO } from './mensagens_comunicado.js';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL || "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

const BOT_URL = process.env.BOT_URL || "https://calendario-boat-production.up.railway.app";

async function enviarViaBot(jid, mensagem) {
  const resp = await fetch(`${BOT_URL}/enviar-jid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid, mensagem })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Bot retornou ${resp.status}: ${txt}`);
  }

  return true;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarComunicadoGrupos() {
  let client;

  try {
    console.log('📢 ENVIO DE COMUNICADO EM MASSA\n');
    console.log('═'.repeat(80));
    console.log('');

    client = await pool.connect();

    // Buscar grupos ativos
    const result = await client.query(`
      WITH grupos_com_dados AS (
        SELECT
          g.grupowppid,
          g.nomegrupowpp,
          g.pb,
          g.cota,
          CONCAT(g.pb, '-', UPPER(g.cota)) as numero_cota,

          (
            SELECT "Cod_Autorizado"
            FROM public."P_BOAT_z_10_Saida_Emb" s
            WHERE s."Cod_Emb_PB" = g.pb
              AND UPPER(s."Grupo_Comp_letra") = UPPER(g.cota)
            ORDER BY "Dt_Agendamento" DESC
            LIMIT 1
          ) as cod_autorizado

        FROM public.wpp_grupos_agenda g
        WHERE g.pb IS NOT NULL
          AND g.cota IS NOT NULL
      ),
      grupos_com_cliente AS (
        SELECT
          gd.*,
          c."Cliente_Nome" as nome_autorizado
        FROM grupos_com_dados gd
        LEFT JOIN public."Cliente" c ON c."Codigo" = gd.cod_autorizado
      )
      SELECT
        grupowppid,
        nomegrupowpp,
        numero_cota,
        nome_autorizado
      FROM grupos_com_cliente
      WHERE cod_autorizado IS NOT NULL
        AND nome_autorizado IS NOT NULL
      ORDER BY numero_cota
    `);

    const grupos = result.rows;

    console.log(`📊 GRUPOS ATIVOS: ${grupos.length}`);
    console.log('');
    console.log('═'.repeat(80));
    console.log('');

    let sucesso = 0;
    let falhas = 0;

    for (let i = 0; i < grupos.length; i++) {
      const grupo = grupos[i];
      const progresso = `[${i + 1}/${grupos.length}]`;

      console.log(`${progresso} ${grupo.numero_cota.padEnd(12)} | ${grupo.nome_autorizado.substring(0, 30)}`);
      console.log(`         Grupo: ${grupo.nomegrupowpp}`);

      try {
        // Enviar as 3 mensagens
        console.log(`         📤 Mensagem 1/3...`);
        await enviarViaBot(grupo.grupowppid, MENSAGEM_1_APRESENTACAO);
        await delay(CONFIG_ENVIO.delayEntreMensagens);

        console.log(`         📤 Mensagem 2/3...`);
        await enviarViaBot(grupo.grupowppid, MENSAGEM_2_FACILIDADES);
        await delay(CONFIG_ENVIO.delayEntreMensagens);

        console.log(`         📤 Mensagem 3/3...`);
        await enviarViaBot(grupo.grupowppid, MENSAGEM_3_GUIA);

        console.log(`         ✅ Concluído!`);
        sucesso++;

        // Delay entre grupos
        if (i < grupos.length - 1) {
          console.log(`         ⏱️  Aguardando ${CONFIG_ENVIO.delayEntreGrupos}ms...\n`);
          await delay(CONFIG_ENVIO.delayEntreGrupos);
        } else {
          console.log('');
        }

      } catch (err) {
        console.log(`         ❌ ERRO: ${err.message}`);
        falhas++;
        console.log('');
      }
    }

    console.log('═'.repeat(80));
    console.log('📊 RESUMO DO ENVIO');
    console.log('═'.repeat(80));
    console.log('');
    console.log(`✅ Sucesso:        ${sucesso} grupos`);
    console.log(`❌ Falhas:         ${falhas} grupos`);
    console.log(`📊 Total:          ${grupos.length} grupos`);
    console.log(`📨 Total mensagens: ${sucesso * 3} enviadas`);
    console.log('');

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.error(err.stack);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Confirmação antes de enviar
console.log('⚠️  ATENÇÃO: Este script enviará mensagens para TODOS os grupos ativos!');
console.log('');
console.log('Tem certeza que deseja continuar?');
console.log('Pressione Ctrl+C para cancelar ou Enter para continuar...');
console.log('');

// Aguardar confirmação
process.stdin.once('data', () => {
  enviarComunicadoGrupos();
});
