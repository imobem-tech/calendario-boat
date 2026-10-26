// ============================================================
// wpp/routes/banco/backup-neon.js — V.260911190000
// BACKUP AUTOMÁTICO DO NEON POSTGRESQL
// Roda no Railway, salva no Vercel Blob Storage
// ============================================================

import { exec } from 'child_process';
import { promisify } from 'util';
import { put, list, del } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurações
const DB_URL = process.env.DATABASE_URL;
const VERCEL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Fazer backup diário do banco
 */
export async function backupDiario() {
  console.log('🔒 Iniciando backup diário do Neon...');

  const dataHora = new Date()
    .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .replace(/[/:]/g, '-')
    .replace(/,/g, '_')
    .replace(/ /g, '');

  const data = new Date()
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .split('/').reverse().join('');

  try {
    // ============================================================
    // 1. BACKUP COMPLETO (formato INSERT)
    // ============================================================

    console.log('📊 1/4 - Backup completo (INSERT format)...');

    const arquivoCompleto = `/tmp/neondb_completo_${dataHora}.sql`;

    await execAsync(
      `pg_dump "${DB_URL}" --data-only --column-inserts --no-owner --no-privileges -f "${arquivoCompleto}"`
    );

    const tamanhoCompleto = fs.statSync(arquivoCompleto).size / 1024;
    console.log(`✅ Backup completo criado: ${tamanhoCompleto.toFixed(2)} KB`);

    // Upload para Vercel Blob
    const blobCompleto = await uploadParaVercelBlob(
      arquivoCompleto,
      `backups/diario/completo_${dataHora}.sql`
    );

    console.log(`☁️  Upload completo: ${blobCompleto.url}`);

    // Limpar arquivo local
    fs.unlinkSync(arquivoCompleto);

    // ============================================================
    // 2. BACKUP TABELAS BANCÁRIAS (bank_*)
    // ============================================================

    console.log('🏦 2/4 - Backup tabelas bancárias...');

    const arquivoBank = `/tmp/bank_tables_${dataHora}.sql`;

    try {
      await execAsync(
        `pg_dump "${DB_URL}" --data-only --column-inserts ` +
        `--table="bank_extratos" ` +
        `--table="bank_categorias" ` +
        `--table="bank_historico_classificacoes" ` +
        `--table="bank_codigos_bacen" ` +
        `--no-owner --no-privileges -f "${arquivoBank}"`
      );

      const tamanhoBank = fs.statSync(arquivoBank).size / 1024;
      console.log(`✅ Backup bancário criado: ${tamanhoBank.toFixed(2)} KB`);

      // Upload para Vercel Blob
      const blobBank = await uploadParaVercelBlob(
        arquivoBank,
        `backups/diario/bank_${dataHora}.sql`
      );

      console.log(`☁️  Upload bancário: ${blobBank.url}`);

      fs.unlinkSync(arquivoBank);

    } catch (err) {
      console.log('⚠️ Erro no backup bancário (tabelas não existem?):', err.message);
    }

    // ============================================================
    // 3. BACKUP ESTRUTURA (só CREATE TABLE)
    // ============================================================

    console.log('🏗️ 3/4 - Backup estrutura...');

    const arquivoEstrutura = `/tmp/estrutura_${data}.sql`;

    await execAsync(
      `pg_dump "${DB_URL}" --schema-only --no-owner --no-privileges -f "${arquivoEstrutura}"`
    );

    const tamanhoEstrutura = fs.statSync(arquivoEstrutura).size / 1024;
    console.log(`✅ Estrutura salva: ${tamanhoEstrutura.toFixed(2)} KB`);

    // Upload para Vercel Blob
    const blobEstrutura = await uploadParaVercelBlob(
      arquivoEstrutura,
      `backups/estrutura/estrutura_${data}.sql`
    );

    console.log(`☁️  Upload estrutura: ${blobEstrutura.url}`);

    fs.unlinkSync(arquivoEstrutura);

    // ============================================================
    // 4. LIMPAR BACKUPS ANTIGOS (manter últimos 30 dias)
    // ============================================================

    console.log('🗑️ 4/4 - Limpando backups antigos...');

    await limparBackupsAntigos(30);

    // ============================================================
    // 5. ESTATÍSTICAS
    // ============================================================

    console.log('📊 Gerando estatísticas...');

    const { blobs } = await list({
      prefix: 'backups/diario/',
      token: VERCEL_BLOB_TOKEN
    });

    const tamanhoTotal = blobs.reduce((sum, b) => sum + b.size, 0) / (1024 * 1024);

    console.log('');
    console.log('✅ BACKUP DIÁRIO CONCLUÍDO!');
    console.log(`   Total de backups: ${blobs.length}`);
    console.log(`   Espaço total: ${tamanhoTotal.toFixed(2)} MB`);
    console.log('');

    return {
      success: true,
      arquivos: [blobCompleto.url, blobBank?.url, blobEstrutura.url].filter(Boolean),
      totalBackups: blobs.length,
      tamanhoTotal: `${tamanhoTotal.toFixed(2)} MB`
    };

  } catch (err) {
    console.error('❌ Erro no backup diário:', err);
    throw err;
  }
}

/**
 * Fazer backup semanal completo
 */
export async function backupSemanal() {
  console.log('🔒 Iniciando backup semanal do Neon...');

  const dataHora = new Date()
    .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .replace(/[/:]/g, '-')
    .replace(/,/g, '_')
    .replace(/ /g, '');

  try {
    // ============================================================
    // 1. BACKUP FORMATO CUSTOM (.dump)
    // ============================================================

    console.log('📦 1/3 - Backup formato custom (.dump)...');

    const arquivoDump = `/tmp/neondb_${dataHora}.dump`;

    await execAsync(
      `pg_dump "${DB_URL}" --format=custom --compress=9 -f "${arquivoDump}"`
    );

    const tamanhoDump = fs.statSync(arquivoDump).size / (1024 * 1024);
    console.log(`✅ Backup .dump criado: ${tamanhoDump.toFixed(2)} MB`);

    // Upload para Vercel Blob
    const blobDump = await uploadParaVercelBlob(
      arquivoDump,
      `backups/semanal/neondb_${dataHora}.dump`
    );

    console.log(`☁️  Upload dump: ${blobDump.url}`);

    fs.unlinkSync(arquivoDump);

    // ============================================================
    // 2. BACKUP FORMATO SQL (legível)
    // ============================================================

    console.log('📄 2/3 - Backup formato SQL...');

    const arquivoSQL = `/tmp/neondb_${dataHora}.sql`;

    await execAsync(
      `pg_dump "${DB_URL}" -f "${arquivoSQL}"`
    );

    const tamanhoSQL = fs.statSync(arquivoSQL).size / (1024 * 1024);
    console.log(`✅ Backup .sql criado: ${tamanhoSQL.toFixed(2)} MB`);

    // Upload para Vercel Blob
    const blobSQL = await uploadParaVercelBlob(
      arquivoSQL,
      `backups/semanal/neondb_${dataHora}.sql`
    );

    console.log(`☁️  Upload SQL: ${blobSQL.url}`);

    fs.unlinkSync(arquivoSQL);

    // ============================================================
    // 3. INFORMAÇÕES DO BANCO
    // ============================================================

    console.log('📊 3/3 - Coletando informações...');

    const info = await coletarInfoBanco();

    const arquivoInfo = `/tmp/info_${dataHora}.txt`;
    fs.writeFileSync(arquivoInfo, info);

    const blobInfo = await uploadParaVercelBlob(
      arquivoInfo,
      `backups/semanal/info_${dataHora}.txt`
    );

    console.log(`☁️  Upload info: ${blobInfo.url}`);

    fs.unlinkSync(arquivoInfo);

    // ============================================================
    // 4. LIMPAR BACKUPS ANTIGOS (manter últimos 6 meses)
    // ============================================================

    console.log('🗑️ Limpando backups semanais antigos...');

    await limparBackupsAntigos(180, 'backups/semanal/');

    // ============================================================
    // 5. ESTATÍSTICAS
    // ============================================================

    const { blobs } = await list({
      prefix: 'backups/semanal/',
      token: VERCEL_BLOB_TOKEN
    });

    const tamanhoTotal = blobs.reduce((sum, b) => sum + b.size, 0) / (1024 * 1024);

    console.log('');
    console.log('✅ BACKUP SEMANAL CONCLUÍDO!');
    console.log(`   Total de backups: ${blobs.length}`);
    console.log(`   Espaço total: ${tamanhoTotal.toFixed(2)} MB`);
    console.log('');

    return {
      success: true,
      arquivos: [blobDump.url, blobSQL.url, blobInfo.url],
      totalBackups: blobs.length,
      tamanhoTotal: `${tamanhoTotal.toFixed(2)} MB`
    };

  } catch (err) {
    console.error('❌ Erro no backup semanal:', err);
    throw err;
  }
}

/**
 * Upload de arquivo para Vercel Blob Storage
 */
async function uploadParaVercelBlob(caminhoArquivo, nomeBlob) {
  const conteudo = fs.readFileSync(caminhoArquivo);

  const blob = await put(nomeBlob, conteudo, {
    access: 'public',
    token: VERCEL_BLOB_TOKEN
  });

  return blob;
}

/**
 * Limpar backups antigos
 */
async function limparBackupsAntigos(dias, prefix = 'backups/diario/') {
  try {
    const { blobs } = await list({
      prefix,
      token: VERCEL_BLOB_TOKEN
    });

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);

    let removidos = 0;

    for (const blob of blobs) {
      const dataBlob = new Date(blob.uploadedAt);

      if (dataBlob < dataLimite) {
        await del(blob.url, { token: VERCEL_BLOB_TOKEN });
        console.log(`   Removido: ${blob.pathname}`);
        removidos++;
      }
    }

    if (removidos > 0) {
      console.log(`✅ ${removidos} backup(s) antigo(s) removido(s)`);
    } else {
      console.log('✅ Nenhum backup antigo para remover');
    }

  } catch (err) {
    console.error('⚠️ Erro ao limpar backups:', err.message);
  }
}

/**
 * Coletar informações do banco
 */
async function coletarInfoBanco() {
  const tabelas = [
    'bank_extratos',
    'bank_categorias',
    'bank_historico_classificacoes'
  ];

  let info = `INFORMAÇÕES DO BANCO DE DADOS\n`;
  info += `Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
  info += `Servidor: ${process.env.DATABASE_URL.split('@')[1].split('/')[0]}\n`;
  info += `Banco: neondb\n\n`;
  info += `CONTAGEM DE REGISTROS:\n`;

  for (const tabela of tabelas) {
    try {
      const { stdout } = await execAsync(
        `psql "${DB_URL}" -t -c "SELECT COUNT(*) FROM ${tabela};"`
      );
      info += `  ${tabela.padEnd(40)}: ${stdout.trim()}\n`;
    } catch {
      info += `  ${tabela.padEnd(40)}: (tabela não existe)\n`;
    }
  }

  return info;
}

/**
 * Listar backups disponíveis
 */
export async function listarBackups(tipo = 'diario') {
  const prefix = `backups/${tipo}/`;

  const { blobs } = await list({
    prefix,
    token: VERCEL_BLOB_TOKEN
  });

  return blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

/**
 * Baixar backup específico
 */
export async function baixarBackup(url) {
  const response = await fetch(url);
  const conteudo = await response.text();
  return conteudo;
}

// ============================================================
// ROTAS EXPRESS
// ============================================================

export function setupBackupRoutes(app) {
  // Executar backup diário manualmente
  app.post('/backup/diario', async (req, res) => {
    try {
      const resultado = await backupDiario();
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Executar backup semanal manualmente
  app.post('/backup/semanal', async (req, res) => {
    try {
      const resultado = await backupSemanal();
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Listar backups (com tipo)
  app.get('/backup/listar/:tipo', async (req, res) => {
    try {
      const tipo = req.params.tipo;
      const backups = await listarBackups(tipo);
      res.json({ backups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Listar backups (sem tipo = diario por padrão)
  app.get('/backup/listar', async (req, res) => {
    try {
      const backups = await listarBackups('diario');
      res.json({ backups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Baixar backup
  app.get('/backup/baixar', async (req, res) => {
    try {
      const { url } = req.query;
      if (!url) {
        return res.status(400).json({ error: 'URL não fornecida' });
      }

      const conteudo = await baixarBackup(url);
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="backup.sql"`);
      res.send(conteudo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================
// FIM
// ============================================================
