// ============================================================
// wpp/routes/banco/cron-sync.js — V.260911203000
// SISTEMA DE SINCRONIZAÇÃO AUTOMÁTICA (CRON)
// ============================================================

import { sincronizarSicredi } from './sicredi-sync.js';

// Estado da última sincronização
let ultimaSincronizacao = {
  sicredi: null,
  executando: false
};

/**
 * Inicia sistema de sincronização periódica
 * - A cada 6 horas
 * - Ou quando disparado pelo WhatsApp
 */
export function iniciarSincronizacaoAutomatica() {
  console.log('⏰ Sistema de sincronização automática iniciado');
  console.log('   🔄 Sicredi: a cada 6 horas');

  // Sincronizar Sicredi a cada 6 horas
  const SEIS_HORAS = 6 * 60 * 60 * 1000;

  setInterval(async () => {
    if (ultimaSincronizacao.executando) {
      console.log('⏳ Sincronização já em execução, pulando...');
      return;
    }

    try {
      console.log('\n🔄 Sincronização automática Sicredi iniciada...');
      ultimaSincronizacao.executando = true;

      await sincronizarSicredi(null, null);

      ultimaSincronizacao.sicredi = new Date();
      console.log(`✅ Sincronização concluída em ${new Date().toLocaleString('pt-BR')}`);

    } catch (err) {
      console.error('❌ Erro na sincronização automática:', err);
    } finally {
      ultimaSincronizacao.executando = false;
    }
  }, SEIS_HORAS);

  // Executar uma vez ao iniciar (após 30 segundos)
  setTimeout(async () => {
    console.log('🚀 Executando primeira sincronização...');
    try {
      ultimaSincronizacao.executando = true;
      await sincronizarSicredi(null, null);
      ultimaSincronizacao.sicredi = new Date();
    } catch (err) {
      console.error('❌ Erro na primeira sincronização:', err);
    } finally {
      ultimaSincronizacao.executando = false;
    }
  }, 30000);
}

/**
 * Dispara sincronização manualmente (trigger do WhatsApp)
 * Evita executar se já sincronizou recentemente (últimos 10 minutos)
 */
export async function dispararSincronizacaoManual(banco = 'SICREDI') {
  try {
    // Verificar se já executou recentemente
    const agoraMs = Date.now();
    const ultimaMs = ultimaSincronizacao.sicredi?.getTime() || 0;
    const diferencaMinutos = (agoraMs - ultimaMs) / 1000 / 60;

    if (diferencaMinutos < 10) {
      console.log(`⏭️  Sincronização ${banco} pulada (última há ${Math.round(diferencaMinutos)} min)`);
      return {
        pulado: true,
        motivo: 'Sincronizado recentemente',
        ultima: ultimaSincronizacao.sicredi
      };
    }

    if (ultimaSincronizacao.executando) {
      console.log('⏳ Sincronização já em execução');
      return {
        pulado: true,
        motivo: 'Já em execução'
      };
    }

    console.log(`🔄 Trigger manual: Sincronizando ${banco}...`);
    ultimaSincronizacao.executando = true;

    const resultado = await sincronizarSicredi(null, null);

    ultimaSincronizacao.sicredi = new Date();
    ultimaSincronizacao.executando = false;

    return {
      sucesso: true,
      timestamp: ultimaSincronizacao.sicredi,
      resultado
    };

  } catch (err) {
    ultimaSincronizacao.executando = false;
    console.error('❌ Erro no trigger manual:', err);
    throw err;
  }
}

/**
 * Retorna status da sincronização
 */
export function statusSincronizacao() {
  return {
    executando: ultimaSincronizacao.executando,
    ultima_sicredi: ultimaSincronizacao.sicredi,
    proxima_sicredi: ultimaSincronizacao.sicredi ?
      new Date(ultimaSincronizacao.sicredi.getTime() + 6 * 60 * 60 * 1000) :
      'Aguardando primeira execução'
  };
}

// ============================================================
// FIM
// ============================================================
