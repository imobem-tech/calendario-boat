// ============================================================
// wpp/routes/banco/backup-cron.js — V.260911190000
// CRON AUTOMÁTICO PARA BACKUPS NO RAILWAY
// ============================================================

import cron from 'node-cron';
import { backupDiario, backupSemanal } from './backup-neon.js';

/**
 * Inicializar cron jobs de backup
 */
export function inicializarBackupCron() {
  console.log('');
  console.log('⏰ Inicializando cron jobs de backup...');

  // ============================================================
  // BACKUP DIÁRIO - Todo dia às 2h (horário de Brasília)
  // ============================================================

  cron.schedule(
    '0 2 * * *',
    async () => {
      console.log('');
      console.log('🔔 CRON: Executando backup diário...');
      console.log('   Horário: ' + new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      }));

      try {
        await backupDiario();
        console.log('✅ CRON: Backup diário concluído com sucesso');
      } catch (err) {
        console.error('❌ CRON: Erro no backup diário:', err);
      }
    },
    {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    }
  );

  console.log('   ✅ Backup diário agendado: Todo dia às 2h (GMT-3)');

  // ============================================================
  // BACKUP SEMANAL - Todo sábado às 3h (horário de Brasília)
  // ============================================================

  cron.schedule(
    '0 3 * * 6',
    async () => {
      console.log('');
      console.log('🔔 CRON: Executando backup semanal...');
      console.log('   Horário: ' + new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      }));

      try {
        await backupSemanal();
        console.log('✅ CRON: Backup semanal concluído com sucesso');
      } catch (err) {
        console.error('❌ CRON: Erro no backup semanal:', err);
      }
    },
    {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    }
  );

  console.log('   ✅ Backup semanal agendado: Todo sábado às 3h (GMT-3)');

  // ============================================================
  // BACKUP IMEDIATO NA INICIALIZAÇÃO (opcional)
  // ============================================================

  // Executar backup diário 1 minuto após inicialização
  setTimeout(async () => {
    console.log('');
    console.log('🚀 Executando backup diário inicial...');

    try {
      await backupDiario();
      console.log('✅ Backup diário inicial concluído');
    } catch (err) {
      console.error('⚠️ Erro no backup inicial (não crítico):', err.message);
    }
  }, 60 * 1000); // 1 minuto

  console.log('   ✅ Backup inicial agendado: 1 minuto após inicialização');

  console.log('');
  console.log('✅ Cron jobs de backup inicializados!');
  console.log('');
}

// ============================================================
// FIM
// ============================================================
