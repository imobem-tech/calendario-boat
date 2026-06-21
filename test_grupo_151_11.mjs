// ============================================================
// TESTE - Msg1 + Figurinha + Msg2 (fixar) no grupo 151-11
// V.2606061410
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
    throw new Error(`Bot retornou ${resp.status}: ${txt}`);
  }

  return await resp.json();
}

async function enviarFigurinha(jid, stickerPath) {
  console.log(`🎭 Enviando figurinha...`);

  try {
    // Ler arquivo da figurinha
    const stickerBuffer = fs.readFileSync(stickerPath);
    const stickerBase64 = stickerBuffer.toString('base64');

    const resp = await fetch(`${BOT_URL}/enviar-sticker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jid,
        stickerBase64
      })
    });

    if (!resp.ok) {
      console.log(`⚠️  Endpoint /enviar-sticker não disponível (${resp.status})`);
      console.log(`   Pulando figurinha...`);
      return null;
    }

    console.log(`✅ Figurinha enviada!`);
    return await resp.json();

  } catch (err) {
    console.log(`⚠️  Erro ao enviar figurinha: ${err.message}`);
    console.log(`   Continuando sem figurinha...`);
    return null;
  }
}

async function fixarMensagem(jid, messageKey) {
  console.log(`📌 Tentando fixar mensagem...`);

  try {
    const resp = await fetch(`${BOT_URL}/fixar-mensagem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid, messageKey })
    });

    if (!resp.ok) {
      console.log(`⚠️  Endpoint /fixar-mensagem não disponível (${resp.status})`);
      console.log(`   Você precisará fixar manualmente`);
      return false;
    }

    console.log(`✅ Mensagem fixada!`);
    return true;

  } catch (err) {
    console.log(`⚠️  Erro ao fixar: ${err.message}`);
    console.log(`   Você precisará fixar manualmente`);
    return false;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testarGrupo151() {
  let client;

  try {
    console.log('🧪 TESTE - MSG1 + FIGURINHA + MSG2 (FIXAR)\n');
    console.log('═'.repeat(80));
    console.log('');

    client = await pool.connect();

    // Buscar grupo 151-11
    const result = await client.query(`
      SELECT grupowppid, nomegrupowpp
      FROM public.wpp_grupos_agenda
      WHERE pb = 151 AND UPPER(cota) = '11'
      LIMIT 1
    `);

    if (result.rowCount === 0) {
      console.error('❌ Grupo 151-11 não encontrado!');
      return;
    }

    const grupo = result.rows[0];
    const jid = grupo.grupowppid;

    console.log(`📊 GRUPO: ${grupo.nomegrupowpp}`);
    console.log(`   ID: ${jid}\n`);
    console.log('═'.repeat(80));
    console.log('');

    // 1. Mensagem 1
    console.log('📨 [1/3] MENSAGEM DE APRESENTAÇÃO');
    console.log('─'.repeat(80));
    console.log(MENSAGEM_1_APRESENTACAO);
    console.log('─'.repeat(80));
    console.log('');
    console.log(`📤 Enviando...`);
    await enviarMensagem(jid, MENSAGEM_1_APRESENTACAO);
    console.log(`✅ Enviado!`);
    console.log(`⏱️  Aguardando ${CONFIG_ENVIO.delayEntreMensagens}ms...\n`);
    await delay(CONFIG_ENVIO.delayEntreMensagens);

    // 2. Figurinha
    console.log('🎭 [2/3] FIGURINHA SUMMER');
    console.log('─'.repeat(80));
    console.log(`Arquivo: ${STICKER_PATH}`);
    console.log('─'.repeat(80));
    console.log('');
    await enviarFigurinha(jid, STICKER_PATH);
    console.log(`⏱️  Aguardando ${CONFIG_ENVIO.delayEntreMensagens}ms...\n`);
    await delay(CONFIG_ENVIO.delayEntreMensagens);

    // 3. Mensagem 2 (fixar)
    console.log('📨 [3/3] GUIA RÁPIDO (SERÁ FIXADA)');
    console.log('─'.repeat(80));
    console.log(MENSAGEM_2_GUIA_FIXAR);
    console.log('─'.repeat(80));
    console.log('');
    console.log(`📤 Enviando...`);
    const msg2Result = await enviarMensagem(jid, MENSAGEM_2_GUIA_FIXAR);
    console.log(`✅ Enviado!`);
    console.log('');

    // Fixar mensagem 2
    if (CONFIG_ENVIO.fixarMensagem2 && msg2Result) {
      await delay(2000);
      await fixarMensagem(jid, msg2Result);
    }

    console.log('');
    console.log('═'.repeat(80));
    console.log('✅ TESTE CONCLUÍDO!');
    console.log('═'.repeat(80));
    console.log('');
    console.log('📱 Verifique o grupo 151-11:');
    console.log('   1. Mensagem 1 chegou?');
    console.log('   2. Figurinha chegou?');
    console.log('   3. Mensagem 2 chegou e está fixada?');
    console.log('');
    console.log('⚠️  Se mensagem 2 NÃO fixou, fixe manualmente');
    console.log('');

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.error(err.stack);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

testarGrupo151();
