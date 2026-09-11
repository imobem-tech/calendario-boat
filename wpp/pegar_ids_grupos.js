// ============================================================
// SCRIPT TEMPORÁRIO - PEGAR IDs DOS GRUPOS FINANCEIROS
// V.260911211000
// ============================================================
//
// COMO USAR:
// 1. Adicionar este código no server.js (listener de mensagens)
// 2. Mandar uma mensagem em cada grupo financeiro
// 3. Ver o ID nos logs
// 4. Anotar os IDs
// 5. Remover este código
//
// ============================================================

// ADICIONAR ESTE TRECHO NO LISTENER DE MENSAGENS (linha ~289):
/*

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    const grupoId = msg.key.remoteJid;
    const nomeGrupo = ''; // Pegar depois via groupMetadata

    // CÓDIGO TEMPORÁRIO - MOSTRAR ID DO GRUPO
    if (grupoId?.endsWith('@g.us')) {
      try {
        const metadata = await sock.groupMetadata(grupoId);
        const nomeGrupo = metadata.subject;

        // Filtrar apenas grupos financeiros
        if (nomeGrupo.toLowerCase().includes('financeiro') ||
            nomeGrupo.toLowerCase().includes('lançamento')) {

          console.log('\n' + '='.repeat(80));
          console.log('💰 GRUPO FINANCEIRO DETECTADO');
          console.log('='.repeat(80));
          console.log('Nome:', nomeGrupo);
          console.log('ID:', grupoId);
          console.log('='.repeat(80) + '\n');
        }
      } catch (err) {
        console.error('Erro ao pegar metadata:', err.message);
      }
    }

    // ... resto do código normal
  }
});

*/

// ============================================================
// EXEMPLO DE SAÍDA DOS LOGS:
// ============================================================
/*

================================================================================
💰 GRUPO FINANCEIRO DETECTADO
================================================================================
Nome: Financeiro ALLMAX
ID: 120363424805097946@g.us
================================================================================

================================================================================
💰 GRUPO FINANCEIRO DETECTADO
================================================================================
Nome: Lançamentos SUMMER
ID: 120363330197701730@g.us
================================================================================

*/

// ============================================================
// DEPOIS DE ANOTAR OS IDs, CRIAR ARQUIVO DE CONFIGURAÇÃO
// ============================================================

export const GRUPOS_FINANCEIROS = {
  'ALLMAX': '120363424805097946@g.us',  // ← Substituir pelo ID real
  'IMOBEM': '120363XXXXXXXXXXX@g.us',   // ← Substituir pelo ID real
  'IMOBAN': '120363XXXXXXXXXXX@g.us',   // ← Substituir pelo ID real
  'SUMMER': '120363330197701730@g.us'   // ← Substituir pelo ID real
};

// Função auxiliar para verificar se mensagem é de grupo financeiro
export function isGrupoFinanceiro(grupoId) {
  return Object.values(GRUPOS_FINANCEIROS).includes(grupoId);
}

// Função para identificar qual empresa pelo grupo
export function identificarEmpresaPorGrupo(grupoId) {
  for (const [empresa, id] of Object.entries(GRUPOS_FINANCEIROS)) {
    if (id === grupoId) {
      return empresa;
    }
  }
  return null;
}

// ============================================================
// FIM
// ============================================================
