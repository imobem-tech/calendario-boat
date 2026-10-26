// ============================================================
// listar-backups-disponiveis.js — V.2610011210
// LISTAR BACKUPS DISPONÍVEIS NO VERCEL BLOB
// ============================================================

import { list } from '@vercel/blob';
import dotenv from 'dotenv';

dotenv.config();

const VERCEL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function listarBackups() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('📦 BACKUPS DISPONÍVEIS - Vercel Blob Storage');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  try {
    // Listar backups diários
    console.log('📅 BACKUPS DIÁRIOS (últimos 30 dias):');
    console.log('');

    const { blobs: diarios } = await list({
      prefix: 'backups/diario/',
      token: VERCEL_BLOB_TOKEN
    });

    const backupsBancariosDiarios = diarios
      .filter(b => b.pathname.includes('bank_'))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    if (backupsBancariosDiarios.length === 0) {
      console.log('   ⚠️  Nenhum backup diário encontrado');
    } else {
      backupsBancariosDiarios.forEach((backup, i) => {
        const data = new Date(backup.uploadedAt).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo'
        });
        const tamanho = (backup.size / 1024).toFixed(2);
        const nome = backup.pathname.split('/').pop();

        console.log(`   ${i + 1}. ${nome}`);
        console.log(`      Data: ${data}`);
        console.log(`      Tamanho: ${tamanho} KB`);
        console.log(`      URL: ${backup.url}`);
        console.log('');
      });
    }

    // Listar backups semanais
    console.log('');
    console.log('📅 BACKUPS SEMANAIS (últimos 6 meses):');
    console.log('');

    const { blobs: semanais } = await list({
      prefix: 'backups/semanal/',
      token: VERCEL_BLOB_TOKEN
    });

    const backupsBancariosSemanais = semanais
      .filter(b => b.pathname.includes('bank_') || b.pathname.includes('neondb_'))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    if (backupsBancariosSemanais.length === 0) {
      console.log('   ⚠️  Nenhum backup semanal encontrado');
    } else {
      backupsBancariosSemanais.slice(0, 10).forEach((backup, i) => {
        const data = new Date(backup.uploadedAt).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo'
        });
        const tamanho = backup.size > 1024 * 1024
          ? `${(backup.size / (1024 * 1024)).toFixed(2)} MB`
          : `${(backup.size / 1024).toFixed(2)} KB`;
        const nome = backup.pathname.split('/').pop();

        console.log(`   ${i + 1}. ${nome}`);
        console.log(`      Data: ${data}`);
        console.log(`      Tamanho: ${tamanho}`);
        console.log(`      URL: ${backup.url}`);
        console.log('');
      });
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Total:');
    console.log(`   Diários: ${backupsBancariosDiarios.length} backup(s)`);
    console.log(`   Semanais: ${backupsBancariosSemanais.length} backup(s)`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // Instruções
    console.log('📋 COMO RESTAURAR:');
    console.log('');
    console.log('   1. Copie a URL do backup desejado');
    console.log('   2. Execute:');
    console.log('');
    console.log('      node restaurar-backup.js restaurar "<URL>"');
    console.log('');

  } catch (err) {
    console.error('❌ Erro ao listar backups:', err);
    throw err;
  }
}

listarBackups().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});

// ============================================================
// FIM
// ============================================================
