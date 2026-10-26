// Script para converter código de convite em JID e buscar mensagens
// Usa o sock do Baileys diretamente via fetch na API

const CODIGO_CONVITE = 'KOo7rBQOd8Z0druVBBPdZR';
const BASE_URL = 'http://localhost:8080/api/wpp';
const TOKEN = 'seu-token-local';

async function buscarGrupo() {
  try {
    console.log('\n🔍 Convertendo código de convite em JID...');
    console.log('Código:', CODIGO_CONVITE);

    // Tentar obter info do grupo via link
    // O Baileys pode ter um método para isso, mas vamos tentar direto

    // Formato padrão de JID de grupo de convite
    // Na verdade, precisamos usar groupGetInviteInfo do Baileys

    console.log('\n⚠️ A API HTTP não expõe groupGetInviteInfo ainda.');
    console.log('\n💡 Solução: Vou pedir ao servidor que adicione um endpoint temporário.');
    console.log('   Ou vamos buscar TODAS as mensagens recentes de TODOS os grupos');
    console.log('   e filtrar pelo nome "Administrativo".');

    // Alternativa: buscar conversas recentes
    console.log('\n📱 Buscando todas as conversas no Baileys...\n');

    const response = await fetch(`${BASE_URL}/conversas`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const data = await response.json();

    if (data.total === 0) {
      console.log('❌ Store ainda vazio. Aguarde sincronização ou use método alternativo.\n');
      return;
    }

    console.log(`✅ ${data.total} conversas encontradas`);

    // Filtrar grupos
    const grupos = data.conversas.filter(c => c.jid.endsWith('@g.us'));
    console.log(`\n📱 ${grupos.length} grupos:\n`);

    grupos.forEach(g => {
      console.log(`${g.nome}`);
      console.log(`   JID: ${g.jid}`);
      console.log(`   Não lidas: ${g.naoLidas}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

buscarGrupo();
