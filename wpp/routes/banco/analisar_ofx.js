// ============================================================
// analisar_ofx.js — V.2609141745
// ANALISADOR DE ARQUIVO OFX DO ASAAS
// Compara com banco de dados e identifica o que falta
// ============================================================

import fs from 'fs';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Parser simples de OFX (adaptado para estrutura do Asaas)
function parseOFX(ofxContent) {
  const transactions = [];
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;

  let match;
  while ((match = stmtRegex.exec(ofxContent)) !== null) {
    const stmtContent = match[1];

    // Extrair campos
    const trnType = stmtContent.match(/<TRNTYPE>(.*?)<\/TRNTYPE>/)?.[1];
    const dtPosted = stmtContent.match(/<DTPOSTED>(.*?)<\/DTPOSTED>/)?.[1];
    const trnAmt = stmtContent.match(/<TRNAMT>(.*?)<\/TRNAMT>/)?.[1];
    const fitId = stmtContent.match(/<FITID>(.*?)<\/FITID>/)?.[1];
    const checkNum = stmtContent.match(/<CHECKNUM>(.*?)<\/CHECKNUM>/)?.[1];
    const memo = stmtContent.match(/<MEMO>(.*?)<\/MEMO>/)?.[1];

    // Converter data YYYYMMDD para YYYY-MM-DD
    const dataFormatada = dtPosted ?
      `${dtPosted.substring(0,4)}-${dtPosted.substring(4,6)}-${dtPosted.substring(6,8)}` :
      null;

    transactions.push({
      tipo: trnType,
      data: dataFormatada,
      valor: parseFloat(trnAmt),
      fitid: fitId,
      documento: checkNum || fitId,
      descricao: memo || '',
      tipo_credito_debito: parseFloat(trnAmt) >= 0 ? 'CREDITO' : 'DEBITO'
    });
  }

  // Extrair conta
  const acctId = ofxContent.match(/<ACCTID>(.*?)<\/ACCTID>/)?.[1];
  const bankId = ofxContent.match(/<BANKID>(.*?)<\/BANKID>/)?.[1];

  return {
    conta: acctId,
    banco: bankId,
    transacoes: transactions
  };
}

async function analisarOFX() {
  try {
    console.log('📂 Lendo arquivo OFX...\n');

    const ofxPath = 'C:\\Users\\NOTEBOOK\\Downloads\\Extrato Asaas.ofx';
    const ofxContent = fs.readFileSync(ofxPath, 'latin1');

    const dados = parseOFX(ofxContent);

    console.log('📊 INFORMAÇÕES DO ARQUIVO:\n');
    console.log(`  Banco: ${dados.banco}`);
    console.log(`  Conta: ${dados.conta}`);
    console.log(`  Total de transações: ${dados.transacoes.length}\n`);

    // Estatísticas por tipo
    const tipos = {};
    dados.transacoes.forEach(t => {
      tipos[t.tipo] = (tipos[t.tipo] || 0) + 1;
    });

    console.log('📈 TIPOS DE TRANSAÇÃO:\n');
    Object.entries(tipos).forEach(([tipo, qtd]) => {
      console.log(`  ${tipo}: ${qtd}`);
    });

    // Verificar quais já existem no banco
    console.log('\n🔍 VERIFICANDO BANCO DE DADOS...\n');

    const fitids = dados.transacoes.map(t => t.fitid);

    const result = await pool.query(`
      SELECT
        id_transacao_banco,
        data,
        valor,
        descricao_original,
        classificacao
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND id_transacao_banco = ANY($1)
    `, [fitids]);

    const existentes = new Set(result.rows.map(r => r.id_transacao_banco));

    console.log(`  ✅ Existentes no BD: ${existentes.size}`);
    console.log(`  ❌ Não existentes: ${dados.transacoes.length - existentes.size}\n`);

    // Analisar existentes sem classificação
    const semClassificacao = result.rows.filter(r => !r.classificacao);
    console.log(`  ⚠️  Existentes SEM CLASSIFICAÇÃO: ${semClassificacao.length}\n`);

    // Separar por tipo
    const novas = dados.transacoes.filter(t => !existentes.has(t.fitid));

    console.log('📋 RESUMO POR TIPO:\n');

    const resumo = {};

    dados.transacoes.forEach(t => {
      if (!resumo[t.tipo]) {
        resumo[t.tipo] = { total: 0, novas: 0, existentes: 0 };
      }

      resumo[t.tipo].total++;
      if (existentes.has(t.fitid)) {
        resumo[t.tipo].existentes++;
      } else {
        resumo[t.tipo].novas++;
      }
    });

    Object.entries(resumo).forEach(([tipo, stats]) => {
      console.log(`  ${tipo}:`);
      console.log(`    Total: ${stats.total}`);
      console.log(`    Existentes: ${stats.existentes}`);
      console.log(`    NOVAS: ${stats.novas}`);
    });

    // Mostrar exemplos de transações novas
    if (novas.length > 0) {
      console.log('\n📄 EXEMPLOS DE TRANSAÇÕES NOVAS (10 primeiras):\n');

      novas.slice(0, 10).forEach((t, i) => {
        console.log(`  ${i+1}. [${t.tipo}] ${t.data} | R$ ${t.valor.toFixed(2)}`);
        console.log(`     ${t.descricao.substring(0, 80)}`);
        console.log(`     FITID: ${t.fitid}\n`);
      });
    }

    // Salvar análise em JSON
    const analise = {
      arquivo: ofxPath,
      data_analise: new Date().toISOString(),
      banco: dados.banco,
      conta: dados.conta,
      total_transacoes: dados.transacoes.length,
      existentes: existentes.size,
      novas: novas.length,
      sem_classificacao: semClassificacao.length,
      resumo_por_tipo: resumo,
      transacoes_novas: novas
    };

    const outputPath = 'wpp/routes/banco/analise_ofx_resultado.json';
    fs.writeFileSync(outputPath, JSON.stringify(analise, null, 2));

    console.log(`\n💾 Análise salva em: ${outputPath}\n`);

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

analisarOFX();
