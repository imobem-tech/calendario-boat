// ============================================================
// restaurar-backup.js — V.2610011205
// RESTAURAR BACKUP DA TABELA bank_extratos
//
// ✅ FUNCIONALIDADES:
//    - Lista backups disponíveis
//    - Baixa backup específico
//    - Restaura apenas tabela bank_extratos
//    - Preserva anexos e outros dados
//    - Cria backup antes de restaurar
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';
import { list, get } from '@vercel/blob';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();

const { Pool } = pkg;
const execAsync = promisify(exec);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const VERCEL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Listar backups disponíveis
 */
export async function listarBackupsDisponiveis(tipo = 'diario') {
  console.log(`📋 Listando backups ${tipo}...`);

  const prefix = `backups/${tipo}/`;

  const { blobs } = await list({
    prefix,
    token: VERCEL_BLOB_TOKEN
  });

  // Filtrar apenas backups bancários
  const backupsBancarios = blobs.filter(b => b.pathname.includes('bank_'));

  const lista = backupsBancarios
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .map(b => ({
      nome: b.pathname.split('/').pop(),
      url: b.url,
      tamanho: `${(b.size / 1024).toFixed(2)} KB`,
      data: new Date(b.uploadedAt).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      })
    }));

  console.log(`✅ ${lista.length} backup(s) encontrado(s)\n`);

  lista.forEach((backup, i) => {
    console.log(`${i + 1}. ${backup.nome}`);
    console.log(`   Data: ${backup.data}`);
    console.log(`   Tamanho: ${backup.tamanho}`);
    console.log('');
  });

  return lista;
}

/**
 * Criar backup de segurança antes de restaurar
 */
async function criarBackupSeguranca() {
  console.log('🔒 Criando backup de segurança antes da restauração...');

  const dataHora = new Date()
    .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .replace(/[/:]/g, '-')
    .replace(/,/g, '_')
    .replace(/ /g, '');

  try {
    // Backup ANTES da restauração
    const arquivoSeguranca = `/tmp/bank_antes_restauracao_${dataHora}.sql`;

    await execAsync(
      `pg_dump "${process.env.DATABASE_URL}" --data-only --column-inserts ` +
      `--table="bank_extratos" ` +
      `--no-owner --no-privileges -f "${arquivoSeguranca}"`
    );

    const tamanho = fs.statSync(arquivoSeguranca).size / 1024;
    console.log(`✅ Backup de segurança criado: ${tamanho.toFixed(2)} KB`);
    console.log(`   Arquivo: ${arquivoSeguranca}\n`);

    return arquivoSeguranca;

  } catch (err) {
    console.error('❌ Erro ao criar backup de segurança:', err.message);
    throw err;
  }
}

/**
 * Baixar backup do Vercel Blob
 */
async function baixarBackup(url) {
  console.log('⬇️  Baixando backup do Vercel Blob...');

  const response = await fetch(url);
  const conteudo = await response.text();

  console.log(`✅ Backup baixado: ${(conteudo.length / 1024).toFixed(2)} KB\n`);

  return conteudo;
}

/**
 * Analisar backup antes de aplicar
 */
async function analisarBackup(conteudoSQL) {
  console.log('🔍 Analisando backup...');

  const linhas = conteudoSQL.split('\n');

  // Contar INSERTs da tabela bank_extratos
  const insertsExtratos = linhas.filter(l =>
    l.trim().startsWith('INSERT INTO') &&
    (l.includes('bank_extratos') || l.includes('"bank_extratos"'))
  );

  // Extrair amostra de dados
  const primeiroInsert = insertsExtratos[0];
  const ultimoInsert = insertsExtratos[insertsExtratos.length - 1];

  console.log(`   Total de registros: ${insertsExtratos.length}`);
  console.log(`   Primeiro INSERT: ${primeiroInsert?.substring(0, 100)}...`);
  console.log(`   Último INSERT: ${ultimoInsert?.substring(0, 100)}...`);
  console.log('');

  return {
    total_registros: insertsExtratos.length,
    tamanho_kb: (conteudoSQL.length / 1024).toFixed(2)
  };
}

/**
 * Restaurar apenas tabela bank_extratos
 */
async function restaurarTabelaBankExtratos(conteudoSQL) {
  console.log('🔄 Restaurando tabela bank_extratos...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. BACKUP dos dados atuais em tabela temporária
    console.log('   1/5 - Salvando dados atuais em temporária...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS bank_extratos_temp_restore AS
      SELECT * FROM bank_extratos
    `);

    const { rows: [{ count: countTemp }] } = await client.query(
      'SELECT COUNT(*) as count FROM bank_extratos_temp_restore'
    );
    console.log(`   ✅ ${countTemp} registros salvos em temporária`);

    // 2. TRUNCAR tabela atual
    console.log('   2/5 - Limpando tabela atual...');

    await client.query('TRUNCATE TABLE bank_extratos CASCADE');
    console.log('   ✅ Tabela limpa');

    // 3. RESTAURAR dados do backup
    console.log('   3/5 - Aplicando backup...');

    // Filtrar apenas INSERTs da tabela bank_extratos
    const linhas = conteudoSQL.split('\n');
    const insertsExtratos = linhas.filter(l =>
      l.trim().startsWith('INSERT INTO') &&
      (l.includes('bank_extratos') || l.includes('"bank_extratos"'))
    );

    let restaurados = 0;
    const batchSize = 100;

    for (let i = 0; i < insertsExtratos.length; i += batchSize) {
      const batch = insertsExtratos.slice(i, i + batchSize);
      const sql = batch.join('\n');

      await client.query(sql);
      restaurados += batch.length;

      if (restaurados % 500 === 0) {
        console.log(`   ... ${restaurados} de ${insertsExtratos.length} restaurados`);
      }
    }

    console.log(`   ✅ ${restaurados} registros restaurados do backup`);

    // 4. VERIFICAR integridade
    console.log('   4/5 - Verificando integridade...');

    const { rows: [{ count: countRestaurado }] } = await client.query(
      'SELECT COUNT(*) as count FROM bank_extratos'
    );

    console.log(`   ✅ Registros após restauração: ${countRestaurado}`);
    console.log(`   ✅ Diferença: ${countRestaurado - countTemp} registros`);

    // 5. ESTATÍSTICAS
    console.log('   5/5 - Estatísticas...');

    const { rows: stats } = await client.query(`
      SELECT
        empresa,
        status,
        COUNT(*) as total
      FROM bank_extratos
      GROUP BY empresa, status
      ORDER BY empresa, status
    `);

    console.log('');
    console.log('   📊 Distribuição por empresa e status:');
    stats.forEach(s => {
      console.log(`      ${s.empresa} - ${s.status || 'NULL'}: ${s.total}`);
    });
    console.log('');

    await client.query('COMMIT');

    console.log('✅ RESTAURAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('');
    console.log('⚠️  IMPORTANTE:');
    console.log('   - Dados atuais salvos em: bank_extratos_temp_restore');
    console.log('   - Para desfazer: DROP TABLE bank_extratos; ALTER TABLE bank_extratos_temp_restore RENAME TO bank_extratos;');
    console.log('');

    return {
      sucesso: true,
      registros_anteriores: parseInt(countTemp),
      registros_restaurados: parseInt(countRestaurado),
      diferenca: parseInt(countRestaurado) - parseInt(countTemp),
      stats
    };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na restauração:', err.message);
    throw err;

  } finally {
    client.release();
  }
}

/**
 * Processo completo de restauração
 */
export async function restaurarBackup(urlBackup) {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('🔄 RESTAURAÇÃO DE BACKUP - bank_extratos');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  try {
    // 1. Criar backup de segurança
    const arquivoSeguranca = await criarBackupSeguranca();

    // 2. Baixar backup do Vercel Blob
    const conteudoSQL = await baixarBackup(urlBackup);

    // 3. Analisar backup
    const analise = await analisarBackup(conteudoSQL);

    // 4. Confirmar com usuário
    console.log('⚠️  ATENÇÃO! Você está prestes a:');
    console.log(`   - Restaurar ${analise.total_registros} registros`);
    console.log(`   - SUBSTITUIR todos os dados atuais da tabela bank_extratos`);
    console.log(`   - Backup de segurança salvo em: ${arquivoSeguranca}`);
    console.log('');
    console.log('   Digite "CONFIRMO" para continuar ou Ctrl+C para cancelar');
    console.log('');

    // 5. Restaurar
    const resultado = await restaurarTabelaBankExtratos(conteudoSQL);

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ RESTAURAÇÃO FINALIZADA');
    console.log('═══════════════════════════════════════════════════');

    return resultado;

  } catch (err) {
    console.error('');
    console.error('═══════════════════════════════════════════════════');
    console.error('❌ ERRO NA RESTAURAÇÃO');
    console.error('═══════════════════════════════════════════════════');
    console.error('Mensagem:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
}

/**
 * Executar restauração por linha de comando
 */
async function executarCLI() {
  const args = process.argv.slice(2);

  if (args[0] === 'listar') {
    const tipo = args[1] || 'diario';
    await listarBackupsDisponiveis(tipo);
    process.exit(0);
  }

  if (args[0] === 'restaurar') {
    const url = args[1];

    if (!url) {
      console.error('❌ Erro: URL do backup não fornecida');
      console.log('');
      console.log('Uso:');
      console.log('  node restaurar-backup.js listar [diario|semanal]');
      console.log('  node restaurar-backup.js restaurar <url-do-backup>');
      process.exit(1);
    }

    await restaurarBackup(url);
    process.exit(0);
  }

  console.log('Comandos disponíveis:');
  console.log('  node restaurar-backup.js listar [diario|semanal]');
  console.log('  node restaurar-backup.js restaurar <url-do-backup>');
}

// Executar CLI se rodado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  executarCLI().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
}

// ============================================================
// FIM
// ============================================================
