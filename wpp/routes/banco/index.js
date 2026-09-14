// ============================================================
// wpp/routes/banco/index.js — V.2609140105
// ROTAS PRINCIPAIS DE INTEGRAÇÃO BANCÁRIA
// + Sistema de Backup Automático (Railway + Vercel Blob)
// + API de Recibos (V.2609140105)
// ============================================================

import express from 'express';
import { handleAsaasWebhook, setSockWhatsApp } from './asaas-webhook.js';
import { sincronizarSicredi } from './sicredi-sync.js';
import {
  iniciarSincronizacaoAutomatica,
  dispararSincronizacaoManual,
  statusSincronizacao
} from './cron-sync.js';
import { setupBackupRoutes } from './backup-neon.js';
import { inicializarBackupCron } from './backup-cron.js';
import recibosRouter from './recibos-api.js';

const router = express.Router();

// ============================================================
// WEBHOOKS (TEMPO REAL)
// ============================================================

/**
 * POST /api/banco/asaas/webhook
 * Recebe eventos do Asaas em tempo real
 */
router.post('/asaas/webhook', handleAsaasWebhook);

// ============================================================
// SINCRONIZAÇÃO MANUAL (POLLING)
// ============================================================

/**
 * POST /api/banco/sicredi/sync
 * Dispara sincronização manual do Sicredi
 */
router.post('/sicredi/sync', async (req, res) => {
  try {
    await sincronizarSicredi(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/banco/status
 * Retorna status da sincronização automática
 */
router.get('/status', (req, res) => {
  res.json(statusSincronizacao());
});

// ============================================================
// BACKUPS AUTOMÁTICOS (Railway + Vercel Blob)
// ============================================================

// Configurar rotas de backup
setupBackupRoutes(router);

// ============================================================
// API DE RECIBOS (V.2609140105)
// ============================================================

/**
 * /api/banco/recibos/*
 * Gerenciamento de recibos salvos no Vercel Blob
 */
router.use('/recibos', recibosRouter);

// ============================================================
// TRIGGER DO WHATSAPP
// ============================================================

/**
 * Função auxiliar para disparar sincronização quando houver
 * movimento no grupo financeiro do WhatsApp
 */
export async function triggerSincronizacaoWhatsApp(banco = 'SICREDI') {
  try {
    const resultado = await dispararSincronizacaoManual(banco);
    console.log('📱 Trigger WhatsApp → Sincronização:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ Erro no trigger WhatsApp:', err);
    return { erro: err.message };
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

/**
 * Inicializa sistema de sincronização automática
 * Chamado pelo server.js ao iniciar
 * @param {Object} sock - Socket WhatsApp para notificações (opcional)
 */
export function inicializarSistemaBancario(sock = null) {
  // Configurar WhatsApp para notificações bancárias
  if (sock) {
    setSockWhatsApp(sock);
  }
  console.log('\n' + '='.repeat(80));
  console.log('💰 SISTEMA BANCÁRIO - INICIALIZADO');
  console.log('='.repeat(80));
  console.log('');
  console.log('🔔 Webhooks ativos:');
  console.log('   ✓ Asaas: POST /api/banco/asaas/webhook');
  console.log('');
  console.log('🔄 Sincronização automática:');
  console.log('   ✓ Sicredi: a cada 6 horas');
  console.log('');
  console.log('📊 Endpoints disponíveis:');
  console.log('   POST /api/banco/sicredi/sync  → Sincronizar manualmente');
  console.log('   GET  /api/banco/status        → Ver status da sincronização');
  console.log('');
  console.log('🏦 Empresas configuradas:');
  console.log('   • ALLMAX  → Asaas + Sicredi');
  console.log('   • IMOBEM  → Asaas + Sicredi');
  console.log('   • IMOBAN  → Sicredi');
  console.log('   • SUMMER  → Asaas + Sicredi');
  console.log('');
  console.log('💾 Backups automáticos:');
  console.log('   ✓ Diário: Todo dia às 2h (GMT-3)');
  console.log('   ✓ Semanal: Sábado às 3h (GMT-3)');
  console.log('   ✓ Armazenamento: Vercel Blob Storage');
  console.log('');
  console.log('📦 Endpoints de backup:');
  console.log('   POST /api/banco/backup/diario         → Backup manual diário');
  console.log('   POST /api/banco/backup/semanal        → Backup manual semanal');
  console.log('   GET  /api/banco/backup/listar/:tipo   → Listar backups');
  console.log('   GET  /api/banco/backup/baixar?url=... → Baixar backup');
  console.log('');
  console.log('📎 API de Recibos:');
  console.log('   GET  /api/banco/recibos/listar         → Listar todos recibos');
  console.log('   GET  /api/banco/recibos/listar?empresa → Filtrar por empresa');
  console.log('   GET  /api/banco/recibos/empresas       → Listar empresas com recibos');
  console.log('   GET  /api/banco/recibos/download/:empresa/:arquivo → Baixar recibo');
  console.log('');
  console.log('='.repeat(80) + '\n');

  // Iniciar cron de sincronização
  iniciarSincronizacaoAutomatica();

  // Iniciar cron de backups — V.260911192500
  inicializarBackupCron();
}

// ============================================================
// EXPORTAÇÕES
// ============================================================

export default router;
export { handleAsaasWebhook, sincronizarSicredi };

// ============================================================
// FIM
// ============================================================
