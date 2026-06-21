// ============================================================
// ⚠️  PRODUÇÃO - Enviar comunicado para TODOS os 84 grupos
// V.2606061415 - Msg1 + Sticker + Msg2 (fixada)
// ⚠️  NÃO EXECUTAR SEM CONFIRMAÇÃO!
// ============================================================
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import { MENSAGEM_1_APRESENTACAO, MENSAGEM_2_GUIA_FIXAR, STICKER_PATH, CONFIG_ENVIO } from './mensagens_comunicado.js';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL || "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

const BOT_URL = process.env.BOT_URL || "https://calendario-boat-production.up.railway.app";

async function enviarMensagem(jid, mensagem) {
  const resp = await fetch(`${BOT_URL}/enviar-jid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid, mensagem })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Bot ${resp.status}: ${txt}`);
  }

  return await resp.json();
}

async function enviarSticker(jid, stickerPath) {
  const stickerBuffer = fs.readFileSync(stickerPath);
  const stickerBase64 = stickerBuffer.toString('base64');

  const resp = await fetch(`${BOT_URL}/enviar-sticker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid, stickerBase64 })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Sticker ${resp.status}: ${txt}`);
  }

  return await resp.json();
}

async function fixarMensagem(jid, messageKey) {
  const resp = await fetch(`${BOT_URL}/fixar-mensagem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid, messageKey })
  });

  if (!resp.ok) {
    throw new Error(`Fixar falhou: ${resp.status}`);
  }

  return await resp.json();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarComunicadoGrupos() {
  let client;

  try {
    console.log('═'.repeat(100));
    console.log('📢 ENVIO DE COMUNICADO EM MASSA - PRODUÇÃO');
    console.log('═'.repeat(100));
    console.log('');
    console.log(`🕐 Início: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
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

    console.log(`📊 GRUPOS ENCONTRADOS: ${grupos.length}`);
    console.log(`📨 Total de mensagens: ${grupos.length * 3} (msg1 + sticker + msg2)`);
    console.log(`⏱️  Tempo estimado: ~${Math.ceil(grupos.length * 11 / 60)} minutos`);
    console.log('');
    console.log('═'.repeat(100));
    console.log('');

    let sucesso = 0;
    let falhas = 0;
    const erros = [];

    for (let i = 0; i < grupos.length; i++) {
      const grupo = grupos[i];
      const progresso = `[${i + 1}/${grupos.length}]`;

      console.log(`${progresso} ${grupo.numero_cota.padEnd(12)} | ${grupo.nome_autorizado.substring(0, 35)}`);

      try {
        // 1. Mensagem 1
        console.log(`         📨 Mensagem 1/3...`);
        await enviarMensagem(grupo.grupowppid, MENSAGEM_1_APRESENTACAO);
        await delay(CONFIG_ENVIO.delayEntreMensagens);

        // 2. Sticker
        console.log(`         🎭 Sticker 2/3...`);
        await enviarSticker(grupo.grupowppid, STICKER_PATH);
        await delay(CONFIG_ENVIO.delayEntreMensagens);

        // 3. Mensagem 2 + Fixar
        console.log(`         📨 Mensagem 3/3...`);
        const msg2Result = await enviarMensagem(grupo.grupowppid, MENSAGEM_2_GUIA_FIXAR);

        if (CONFIG_ENVIO.fixarMensagem2 && msg2Result?.messageKey) {
          await delay(2000);
          console.log(`         📌 Fixando...`);
          await fixarMensagem(grupo.grupowppid, msg2Result.messageKey);
        }

        console.log(`         ✅ Concluído!`);
        sucesso++;

        // Delay entre grupos
        if (i < grupos.length - 1) {
          await delay(CONFIG_ENVIO.delayEntreGrupos);
        }
        console.log('');

      } catch (err) {
        console.log(`         ❌ ERRO: ${err.message}`);
        falhas++;
        erros.push({ grupo: grupo.numero_cota, nome: grupo.nome_autorizado, erro: err.message });
        console.log('');
      }
    }

    console.log('═'.repeat(100));
    console.log('📊 RESUMO DO ENVIO');
    console.log('═'.repeat(100));
    console.log('');
    console.log(`✅ Sucesso:            ${sucesso} grupos`);
    console.log(`❌ Falhas:             ${falhas} grupos`);
    console.log(`📊 Total:              ${grupos.length} grupos`);
    console.log(`📨 Mensagens enviadas: ${sucesso * 3}`);
    console.log(`🎭 Stickers enviados:  ${sucesso}`);
    console.log(`📌 Mensagens fixadas:  ${sucesso}`);
    console.log(`🕐 Fim: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log('');

    if (erros.length > 0) {
      console.log('═'.repeat(100));
      console.log('❌ ERROS DETALHADOS:');
      console.log('═'.repeat(100));
      console.log('');
      erros.forEach((e, i) => {
        console.log(`${i + 1}. ${e.grupo} (${e.nome})`);
        console.log(`   Erro: ${e.erro}`);
        console.log('');
      });
    }

  } catch (err) {
    console.error('❌ ERRO CRÍTICO:', err.message);
    console.error(err.stack);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// ============================================================
// CONFIRMAÇÃO OBRIGATÓRIA
// ============================================================

console.log('');
console.log('═'.repeat(100));
console.log('⚠️  ⚠️  ⚠️  ATENÇÃO - ENVIO EM MASSA  ⚠️  ⚠️  ⚠️');
console.log('═'.repeat(100));
console.log('');
console.log('Este script enviará comunicado para TODOS os grupos ativos!');
console.log('');
console.log('📋 Sequência por grupo:');
console.log('   1. Mensagem de apresentação (Summer + Allmax)');
console.log('   2. Sticker Summer');
console.log('   3. Guia do MARUJO (será fixada automaticamente)');
console.log('');
console.log('⏱️  Delay entre mensagens: 3 segundos');
console.log('⏱️  Delay entre grupos: 5 segundos');
console.log('');
console.log('═'.repeat(100));
console.log('');
console.log('❓ Tem certeza que deseja continuar?');
console.log('');
console.log('   Digite "SIM" (em maiúsculas) e pressione ENTER para confirmar');
console.log('   ou pressione Ctrl+C para CANCELAR');
console.log('');
console.log('═'.repeat(100));
console.log('');

// Aguardar confirmação explícita
process.stdin.once('data', (data) => {
  const resposta = data.toString().trim();

  if (resposta === 'SIM') {
    console.log('');
    console.log('✅ Confirmado! Iniciando envio...');
    console.log('');
    enviarComunicadoGrupos();
  } else {
    console.log('');
    console.log('❌ Cancelado! Resposta diferente de "SIM"');
    console.log('   Você digitou:', resposta);
    console.log('');
    process.exit(0);
  }
});
