// ============================================================
// importar_ofx.js — V.2609142018
// IMPORTADOR DE ARQUIVO OFX DO ASAAS
// Importa transações com detecção inteligente de duplicatas
// Data de importação = data da transação + 00:01:00
// ============================================================

import fs from 'fs';
import pkg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Parser OFX
function parseOFX(ofxContent) {
  const transactions = [];
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;

  let match;
  while ((match = stmtRegex.exec(ofxContent)) !== null) {
    const stmtContent = match[1];

    const trnType = stmtContent.match(/<TRNTYPE>(.*?)<\/TRNTYPE>/)?.[1];
    const dtPosted = stmtContent.match(/<DTPOSTED>(.*?)<\/DTPOSTED>/)?.[1];
    const trnAmt = stmtContent.match(/<TRNAMT>(.*?)<\/TRNAMT>/)?.[1];
    const fitId = stmtContent.match(/<FITID>(.*?)<\/FITID>/)?.[1];
    const checkNum = stmtContent.match(/<CHECKNUM>(.*?)<\/CHECKNUM>/)?.[1];
    const memo = stmtContent.match(/<MEMO>(.*?)<\/MEMO>/)?.[1];

    const dataFormatada = dtPosted ?
      `${dtPosted.substring(0,4)}-${dtPosted.substring(4,6)}-${dtPosted.substring(6,8)}` :
      null;

    const valor = parseFloat(trnAmt);

    transactions.push({
      tipo_ofx: trnType,
      data: dataFormatada,
      valor: valor,
      fitid: fitId,
      checknum: checkNum || null,
      documento: checkNum || fitId,
      descricao: memo || '',
      tipo: valor >= 0 ? 'CREDITO' : 'DEBITO'
    });
  }

  return transactions;
}

// Gerar hash único
function gerarHash(data, valor, descricao, empresa, fitid) {
  const chave = `${empresa}_${fitid}_${data}_${valor}_${descricao}`;
  return crypto.createHash('sha256').update(chave).digest('hex');
}

// Verificar duplicata
async function verificarDuplicata(data, valor, empresa) {
  const result = await pool.query(`
    SELECT id, descricao_original
    FROM bank_extratos
    WHERE empresa = $1
      AND banco = 'Asaas'
      AND data = $2
      AND ABS(valor - $3) < 0.01
    LIMIT 1
  `, [empresa, data, valor]);

  return result.rows.length > 0 ? result.rows[0] : null;
}

// Importar uma transação
async function importarTransacao(transacao, empresa, client) {
  const hash = gerarHash(transacao.data, transacao.valor, transacao.descricao, empresa, transacao.fitid);

  // Dados bancários da ALLMAX
  const dadosBancarios = {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta: '6327105',
    conta_dv: '0',
    tipo_conta: 'Conta de Pagamento'
  };

  const mesRef = transacao.data.substring(0, 7) + '-01'; // YYYY-MM-01 (primeiro dia do mês)

  // Data de importação = data da transação + 00:01:00
  const dataImportacao = transacao.data + ' 00:01:00';

  await client.query(`
    INSERT INTO bank_extratos (
      empresa,
      banco,
      codigo_banco,
      nome_banco,
      agencia,
      agencia_dv,
      conta,
      conta_dv,
      tipo_conta,
      data,
      mes_ref,
      valor,
      descricao_original,
      documento,
      tipo,
      id_transacao_banco,
      tipo_importacao,
      hash_unico,
      importado_em
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
  `, [
    empresa,
    'Asaas',
    dadosBancarios.banco,
    dadosBancarios.nome_banco,
    dadosBancarios.agencia,
    dadosBancarios.agencia_dv,
    dadosBancarios.conta,
    dadosBancarios.conta_dv,
    dadosBancarios.tipo_conta,
    transacao.data,
    mesRef,
    transacao.valor,
    transacao.descricao,
    transacao.documento,
    transacao.tipo,
    transacao.fitid,
    'OFX',
    hash,
    dataImportacao
  ]);
}

async function importar() {
  try {
    console.log('📥 IMPORTADOR DE OFX - ASAAS\n');
    console.log('='.repeat(80) + '\n');

    // Ler OFX
    const ofxPath = 'C:\\\\Users\\\\NOTEBOOK\\\\Downloads\\\\Extrato Asaas.ofx';
    const ofxContent = fs.readFileSync(ofxPath, 'latin1');
    const transacoes = parseOFX(ofxContent);

    console.log(`📂 Arquivo: ${ofxPath}`);
    console.log(`📊 Total de transações: ${transacoes.length}\n`);

    // Separar por período
    const dias01_10 = transacoes.filter(t => {
      const dia = parseInt(t.data.split('-')[2]);
      return dia >= 1 && dia <= 10;
    });

    const dias11_14 = transacoes.filter(t => {
      const dia = parseInt(t.data.split('-')[2]);
      return dia >= 11 && dia <= 14;
    });

    console.log('📋 PLANO DE IMPORTAÇÃO:\n');
    console.log(`  Dias 01-10: ${dias01_10.length} transações (importar TODAS)`);
    console.log(`  Dias 11-14: ${dias11_14.length} transações (verificar duplicatas)\n`);

    console.log('='.repeat(80) + '\n');
    console.log('🚀 INICIANDO IMPORTAÇÃO...\n');

    const stats = {
      importados: 0,
      duplicatas: 0,
      erros: 0,
      por_data: {}
    };

    // Usar transação SQL
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // FASE 1: Importar dias 01-10 (sem verificar duplicatas)
      console.log('📥 FASE 1: Importando dias 01-10...\n');

      for (const transacao of dias01_10) {
        try {
          await importarTransacao(transacao, 'ALLMAX', client);
          stats.importados++;
          stats.por_data[transacao.data] = (stats.por_data[transacao.data] || 0) + 1;

          if (stats.importados % 20 === 0) {
            console.log(`  ✅ Importadas: ${stats.importados}/${dias01_10.length}...`);
          }
        } catch (err) {
          console.error(`  ❌ Erro ao importar ${transacao.data}: ${err.message}`);
          stats.erros++;
        }
      }

      console.log(`\n  ✅ Fase 1 concluída: ${stats.importados} importadas\n`);

      // FASE 2: Importar dias 11-14 (verificando duplicatas)
      console.log('📥 FASE 2: Importando dias 11-14 (verificando duplicatas)...\n');

      for (const transacao of dias11_14) {
        try {
          // Verificar duplicata
          const duplicata = await verificarDuplicata(transacao.data, transacao.valor, 'ALLMAX');

          if (duplicata) {
            stats.duplicatas++;
            // Não mostrar cada duplicata para não poluir
          } else {
            await importarTransacao(transacao, 'ALLMAX', client);
            stats.importados++;
            stats.por_data[transacao.data] = (stats.por_data[transacao.data] || 0) + 1;
          }

          const processadas = stats.importados + stats.duplicatas - dias01_10.length;
          if (processadas % 10 === 0) {
            console.log(`  Processadas: ${processadas}/${dias11_14.length} (${stats.duplicatas} duplicatas)...`);
          }
        } catch (err) {
          console.error(`  ❌ Erro ao processar ${transacao.data}: ${err.message}`);
          stats.erros++;
        }
      }

      console.log(`\n  ✅ Fase 2 concluída\n`);

      // Commit da transação
      await client.query('COMMIT');
      console.log('✅ TRANSAÇÃO CONFIRMADA NO BANCO!\n');

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ ERRO! Revertendo tudo...\n');
      throw err;
    } finally {
      client.release();
    }

    // Relatório final
    console.log('='.repeat(80) + '\n');
    console.log('📊 RELATÓRIO FINAL:\n');
    console.log(`  ✅ Importadas: ${stats.importados}`);
    console.log(`  ⏭️  Duplicatas puladas: ${stats.duplicatas}`);
    console.log(`  ❌ Erros: ${stats.erros}\n`);

    console.log('📅 POR DATA:\n');
    Object.entries(stats.por_data).sort().forEach(([data, qtd]) => {
      console.log(`  ${data}: ${qtd.toString().padStart(3)} importadas`);
    });

    // Verificação final
    console.log('\n' + '='.repeat(80) + '\n');
    console.log('🔍 VERIFICAÇÃO FINAL:\n');

    const check = await pool.query(`
      SELECT COUNT(*) as total
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND data >= '2026-09-01'
        AND data <= '2026-09-14'
    `);

    const totalBD = parseInt(check.rows[0].total);
    const totalOFX = transacoes.length;

    console.log(`  Total no BD:  ${totalBD}`);
    console.log(`  Total no OFX: ${totalOFX}\n`);

    if (totalBD === totalOFX) {
      console.log('  🎉 PERFEITO! Os números batem exatamente!\n');
    } else {
      const diff = totalOFX - totalBD;
      console.log(`  ⚠️  Diferença: ${Math.abs(diff)} registros`);
      console.log(`     ${diff > 0 ? 'Faltam' : 'BD tem extras'}: ${Math.abs(diff)}\n`);
    }

    console.log('='.repeat(80) + '\n');
    console.log('✅ IMPORTAÇÃO CONCLUÍDA COM SUCESSO!\n');

  } catch (err) {
    console.error('❌ Erro fatal:', err);
  } finally {
    await pool.end();
  }
}

importar();
