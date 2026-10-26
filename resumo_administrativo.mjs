// Script para gerar resumo do grupo Administrativo Allmax
// V.260923231500

const CODIGO_CONVITE = 'KOo7rBQOd8Z0druVBBPdZR';
const BASE_URL = 'http://localhost:8080/api/wpp';
const TOKEN = 'seu-token-local';

async function aguardarServidor(tentativas = 30) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const response = await fetch(`${BASE_URL}/status`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.conectado) {
          console.log(`✅ Servidor conectado! (${data.numero})\n`);
          return true;
        }
      }
    } catch (err) {
      // Servidor ainda não está pronto
    }

    if (i < tentativas) {
      process.stdout.write(`\r⏳ Aguardando servidor... (${i}/${tentativas})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n❌ Timeout: servidor não respondeu\n');
  return false;
}

async function obterJID() {
  console.log('🔍 Convertendo código de convite em JID...');
  console.log(`Código: ${CODIGO_CONVITE}\n`);

  try {
    const response = await fetch(`${BASE_URL}/grupo-info/${CODIGO_CONVITE}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!response.ok) {
      const erro = await response.json();
      throw new Error(erro.erro || `HTTP ${response.status}`);
    }

    const info = await response.json();

    console.log('✅ Grupo encontrado!');
    console.log(`📱 Nome: ${info.nome}`);
    console.log(`🆔 JID: ${info.jid}`);
    console.log(`👥 Membros: ${info.tamanho || 'N/A'}\n`);

    return info.jid;
  } catch (error) {
    console.error('❌ Erro ao obter JID:', error.message);
    return null;
  }
}

async function buscarMensagensHoje(jid) {
  console.log('📬 Buscando mensagens de hoje...\n');

  try {
    const response = await fetch(`${BASE_URL}/mensagens-grupo/${encodeURIComponent(jid)}?limite=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!response.ok) {
      const erro = await response.json();
      throw new Error(erro.erro || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Filtrar mensagens de hoje
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const mensagensHoje = data.mensagens.filter(msg => {
      const dataMensagem = msg.data.split(',')[0]; // Pega só a data
      return dataMensagem === hoje;
    });

    console.log(`✅ ${mensagensHoje.length} mensagens de hoje (de ${data.total} total)\n`);

    return mensagensHoje;
  } catch (error) {
    console.error('❌ Erro ao buscar mensagens:', error.message);
    return [];
  }
}

function gerarResumo(mensagens) {
  console.log('📊 RESUMO DO DIA - Administrativo Allmax');
  console.log('='.repeat(60));
  console.log(`Data: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`Total de mensagens: ${mensagens.length}\n`);

  if (mensagens.length === 0) {
    console.log('ℹ️ Nenhuma mensagem hoje ainda.\n');
    return;
  }

  // Agrupar por participante
  const porParticipante = {};
  mensagens.forEach(msg => {
    const nome = msg.de === 'eu' ? 'Você' : msg.de;
    if (!porParticipante[nome]) {
      porParticipante[nome] = [];
    }
    porParticipante[nome].push(msg);
  });

  console.log('👥 PARTICIPAÇÃO:');
  Object.entries(porParticipante)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([nome, msgs]) => {
      console.log(`   ${nome}: ${msgs.length} mensagens`);
    });

  console.log('\n💬 MENSAGENS:\n');

  mensagens.forEach((msg, i) => {
    const hora = msg.data.split(' ')[1]; // Pega só a hora
    const autor = msg.de === 'eu' ? '📤 Você' : `📥 ${msg.de}`;
    console.log(`[${hora}] ${autor}`);
    console.log(`    ${msg.texto}`);
    if (i < mensagens.length - 1) console.log('');
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Resumo gerado com sucesso!');
  console.log(`\nV.260923231500 | ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`);
}

async function main() {
  console.log('\n📱 RESUMO GRUPO ADMINISTRATIVO ALLMAX\n');

  // 1. Aguardar servidor
  const servidorOk = await aguardarServidor();
  if (!servidorOk) {
    process.exit(1);
  }

  // 2. Obter JID do grupo
  const jid = await obterJID();
  if (!jid) {
    process.exit(1);
  }

  // 3. Buscar mensagens
  const mensagens = await buscarMensagensHoje(jid);

  // 4. Gerar resumo
  gerarResumo(mensagens);
}

main().catch(console.error);
