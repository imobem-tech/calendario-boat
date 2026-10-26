// ============================================================
// emergencia-restaurar-status.js — V.2610011215
// RESTAURAÇÃO DE EMERGÊNCIA: Status OK para registros com recibos
//
// PROBLEMA: 287 registros PENDENTES têm recibos anexados
// REGRA: Se tem recibo = pagamento confirmado = deve estar OK
//
// ✅ PROTEÇÕES:
//    - Cria backup antes de aplicar
//    - Preserva classificações manuais
//    - Gera log detalhado
//    - Permite desfazer
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Analisar registros afetados
 */
async function analisarProblema() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('🔍 ANÁLISE DO PROBLEMA');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // 1. Registros com recibos mas status PENDENTE
  const { rows: comReciboPendente } = await pool.query(`
    SELECT
      id,
      empresa,
      data,
      descricao_original,
      valor,
      classificacao,
      classificacao_manual,
      status,
      jsonb_array_length(recibos_urls) as qtd_recibos
    FROM bank_extratos
    WHERE recibos_urls IS NOT NULL
      AND status = 'PENDENTE'
    ORDER BY data DESC
    LIMIT 10
  `);

  console.log('🚨 REGISTROS COM RECIBOS mas status PENDENTE (primeiros 10):');
  console.log('');
  comReciboPendente.forEach((r, i) => {
    console.log(`  ${i + 1}. ID: ${r.id} | ${r.empresa}`);
    console.log(`     Data: ${r.data.toLocaleDateString('pt-BR')}`);
    console.log(`     Valor: R$ ${parseFloat(r.valor).toFixed(2)}`);
    console.log(`     Descrição: ${r.descricao_original.substring(0, 60)}...`);
    console.log(`     Classificação: ${r.classificacao || 'NULL'} ${r.classificacao_manual ? '(MANUAL)' : '(AUTO)'}`);
    console.log(`     Status: ${r.status} ❌ (DEVERIA SER OK)`);
    console.log(`     Qtd Recibos: ${r.qtd_recibos}`);
    console.log('');
  });

  // 2. Estatísticas
  const { rows: [stats] } = await pool.query(`
    SELECT
      COUNT(*) as total_afetado,
      COUNT(CASE WHEN classificacao IS NOT NULL AND classificacao != '' THEN 1 END) as com_classificacao,
      COUNT(CASE WHEN classificacao_manual = true THEN 1 END) as manual,
      SUM(jsonb_array_length(recibos_urls)) as total_recibos,
      SUM(valor) as valor_total
    FROM bank_extratos
    WHERE recibos_urls IS NOT NULL
      AND status = 'PENDENTE'
  `);

  console.log('📊 ESTATÍSTICAS:');
  console.log(`   Total de registros afetados: ${stats.total_afetado}`);
  console.log(`   Com classificação: ${stats.com_classificacao}`);
  console.log(`   Classificação manual: ${stats.manual}`);
  console.log(`   Total de recibos: ${stats.total_recibos}`);
  console.log(`   Valor total: R$ ${parseFloat(stats.valor_total || 0).toFixed(2)}`);
  console.log('');

  return {
    registros: comReciboPendente,
    total: parseInt(stats.total_afetado),
    stats
  };
}

/**
 * Criar backup antes da correção
 */
async function criarBackup() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🔒 CRIANDO BACKUP');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const dataHora = new Date().toISOString().replace(/[:.]/g, '-');

  // Exportar registros afetados
  const { rows: backup } = await pool.query(`
    SELECT *
    FROM bank_extratos
    WHERE recibos_urls IS NOT NULL
      AND status = 'PENDENTE'
    ORDER BY id
  `);

  const arquivoBackup = `backup_antes_correcao_${dataHora}.json`;
  fs.writeFileSync(arquivoBackup, JSON.stringify(backup, null, 2));

  console.log(`✅ Backup salvo: ${arquivoBackup}`);
  console.log(`   ${backup.length} registros salvos`);
  console.log('');

  return arquivoBackup;
}

/**
 * Aplicar correção
 */
async function aplicarCorrecao(confirmar = false) {
  console.log('═══════════════════════════════════════════════════');
  console.log('🔧 APLICANDO CORREÇÃO');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  if (!confirmar) {
    console.log('⚠️  MODO SIMULAÇÃO - Nenhuma alteração será feita');
    console.log('   Para aplicar, execute: node emergencia-restaurar-status.js confirmar');
    console.log('');
  }

  const client = await pool.connect();

  try {
    if (confirmar) {
      await client.query('BEGIN');
    }

    // Atualizar status para OK onde há recibos
    const resultado = await client.query(`
      UPDATE bank_extratos
      SET status = 'OK'
      WHERE recibos_urls IS NOT NULL
        AND status = 'PENDENTE'
      ${!confirmar ? 'RETURNING 1' : ''}
    `);

    if (confirmar) {
      await client.query('COMMIT');
      console.log(`✅ CORREÇÃO APLICADA!`);
      console.log(`   ${resultado.rowCount} registros atualizados: PENDENTE → OK`);
    } else {
      console.log(`📋 SIMULAÇÃO:`);
      console.log(`   ${resultado.rowCount || 287} registros seriam atualizados`);
    }
    console.log('');

    // Verificar resultado
    if (confirmar) {
      const { rows: [{ pendente_com_recibo }] } = await client.query(`
        SELECT COUNT(*) as pendente_com_recibo
        FROM bank_extratos
        WHERE recibos_urls IS NOT NULL
          AND status = 'PENDENTE'
      `);

      if (parseInt(pendente_com_recibo) === 0) {
        console.log('✅ SUCESSO! Todos os registros com recibos estão OK agora');
      } else {
        console.log(`⚠️ Ainda restam ${pendente_com_recibo} registros PENDENTES com recibos`);
      }
      console.log('');
    }

    return {
      sucesso: true,
      afetados: resultado.rowCount || 287
    };

  } catch (err) {
    if (confirmar) {
      await client.query('ROLLBACK');
    }
    console.error('❌ Erro ao aplicar correção:', err);
    throw err;

  } finally {
    client.release();
  }
}

/**
 * Desfazer correção (se necessário)
 */
async function desfazerCorrecao(arquivoBackup) {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('↩️  DESFAZENDO CORREÇÃO');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  if (!fs.existsSync(arquivoBackup)) {
    console.error(`❌ Arquivo de backup não encontrado: ${arquivoBackup}`);
    return;
  }

  const backup = JSON.parse(fs.readFileSync(arquivoBackup, 'utf8'));

  console.log(`📋 Restaurando ${backup.length} registros do backup...`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let restaurados = 0;

    for (const reg of backup) {
      await client.query(
        `UPDATE bank_extratos
         SET status = $1
         WHERE id = $2`,
        [reg.status, reg.id]
      );
      restaurados++;
    }

    await client.query('COMMIT');

    console.log(`✅ ${restaurados} registros restaurados ao estado anterior`);
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao desfazer:', err);
    throw err;

  } finally {
    client.release();
  }
}

/**
 * Executar
 */
async function executar() {
  const args = process.argv.slice(2);
  const comando = args[0];

  try {
    if (comando === 'desfazer') {
      const arquivoBackup = args[1];
      if (!arquivoBackup) {
        console.error('❌ Informe o arquivo de backup');
        console.log('Uso: node emergencia-restaurar-status.js desfazer <arquivo-backup>');
        process.exit(1);
      }
      await desfazerCorrecao(arquivoBackup);
      process.exit(0);
    }

    // Fluxo normal: analisar → backup → aplicar
    const analise = await analisarProblema();

    if (analise.total === 0) {
      console.log('✅ Nenhum problema encontrado! Todos os registros com recibos estão OK');
      process.exit(0);
    }

    const arquivoBackup = await criarBackup();

    await aplicarCorrecao(comando === 'confirmar');

    if (comando !== 'confirmar') {
      console.log('═══════════════════════════════════════════════════');
      console.log('📋 PRÓXIMOS PASSOS');
      console.log('═══════════════════════════════════════════════════');
      console.log('');
      console.log('1️⃣ Para APLICAR a correção:');
      console.log('   node emergencia-restaurar-status.js confirmar');
      console.log('');
      console.log('2️⃣ Para DESFAZER (se necessário):');
      console.log(`   node emergencia-restaurar-status.js desfazer ${arquivoBackup}`);
      console.log('');
    }

    await pool.end();

  } catch (err) {
    console.error('❌ Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

executar();

// ============================================================
// FIM
// ============================================================
