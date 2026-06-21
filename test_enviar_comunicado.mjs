// ============================================================
// Script de TESTE - Enviar comunicado no privado
// V.2606061350
// ============================================================
import { MENSAGEM_1_APRESENTACAO, MENSAGEM_2_FACILIDADES, MENSAGEM_3_GUIA, CONFIG_ENVIO } from './mensagens_comunicado.js';

const BOT_URL = process.env.BOT_URL || "https://calendario-boat-production.up.railway.app";

// SEU TELEFONE (ajustar se necessário)
const SEU_TELEFONE = "5563999701419"; // Ajuste para seu número

async function enviarViaBot(jid, mensagem) {
  console.log(`📤 Enviando para ${jid}...`);

  const resp = await fetch(`${BOT_URL}/enviar-jid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid, mensagem })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Bot retornou ${resp.status}: ${txt}`);
  }

  console.log(`✅ Enviado!`);
  return true;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testarComunicado() {
  try {
    console.log('🧪 TESTE DE COMUNICADO - ENVIO PRIVADO\n');
    console.log('═'.repeat(60));
    console.log('');

    // Formatar JID
    let jid = SEU_TELEFONE;
    if (!jid.startsWith("55")) jid = "55" + jid;
    if (jid.length === 12) jid = jid.slice(0, 4) + "9" + jid.slice(4);
    jid = jid + "@s.whatsapp.net";

    console.log(`📱 Destinatário: ${jid}`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('');

    // Mensagem 1
    console.log('📨 MENSAGEM 1/3: APRESENTAÇÃO');
    console.log('─'.repeat(60));
    console.log(MENSAGEM_1_APRESENTACAO);
    console.log('─'.repeat(60));
    console.log('');

    await enviarViaBot(jid, MENSAGEM_1_APRESENTACAO);
    console.log(`⏱️  Aguardando ${CONFIG_ENVIO.delayEntreMensagens}ms...\n`);
    await delay(CONFIG_ENVIO.delayEntreMensagens);

    // Mensagem 2
    console.log('📨 MENSAGEM 2/3: FACILIDADES');
    console.log('─'.repeat(60));
    console.log(MENSAGEM_2_FACILIDADES);
    console.log('─'.repeat(60));
    console.log('');

    await enviarViaBot(jid, MENSAGEM_2_FACILIDADES);
    console.log(`⏱️  Aguardando ${CONFIG_ENVIO.delayEntreMensagens}ms...\n`);
    await delay(CONFIG_ENVIO.delayEntreMensagens);

    // Mensagem 3
    console.log('📨 MENSAGEM 3/3: GUIA RÁPIDO');
    console.log('─'.repeat(60));
    console.log(MENSAGEM_3_GUIA);
    console.log('─'.repeat(60));
    console.log('');

    await enviarViaBot(jid, MENSAGEM_3_GUIA);

    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ TESTE CONCLUÍDO!');
    console.log('═'.repeat(60));
    console.log('');
    console.log('📱 Verifique seu WhatsApp e avalie:');
    console.log('   1. Clareza das mensagens');
    console.log('   2. Formatação (negrito, emojis)');
    console.log('   3. Ordem de apresentação');
    console.log('   4. Conteúdo completo');
    console.log('');
    console.log('💬 Após aprovar, vou criar o script de envio em massa!');
    console.log('');

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.error(err.stack);
  }
}

testarComunicado();
