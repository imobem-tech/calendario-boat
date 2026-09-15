// ============================================================
// comparar_bd_vs_ofx.js — V.2609141805
// COMPARAÇÃO VISUAL: BD vs OFX
// ============================================================

import fs from 'fs';
import pkg from 'pg';
import dotenv from 'dotenv';

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

    transactions.push({
      tipo_ofx: trnType,
      data: dataFormatada,
      valor: parseFloat(trnAmt),
      fitid: fitId,
      checknum: checkNum || null,
      descricao: (memo || '').substring(0, 60)
    });
  }

  return transactions;
}

async function comparar() {
  try {
    console.log('🔍 COMPARAÇÃO: BANCO DE DADOS vs ARQUIVO OFX\n');
    console.log('='.repeat(100) + '\n');

    // Buscar o que está no BD
    const bd = await pool.query(`
      SELECT
        id,
        data,
        valor,
        descricao_original,
        documento,
        id_transacao_banco,
        tipo
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND data >= '2026-09-01'
        AND data <= '2026-09-14'
      ORDER BY data, id
    `);

    console.log(`📊 BANCO DE DADOS (${bd.rows.length} registros):\n`);

    bd.rows.forEach((r, i) => {
      const dataF = r.data.toISOString().split('T')[0];
      console.log(`${(i+1).toString().padStart(3)}. [${dataF}] R$ ${r.valor.toString().padStart(10)} | ${r.descricao_original.substring(0, 50)}`);
    });

    // Ler OFX
    const ofxPath = 'C:\\Users\\NOTEBOOK\\Downloads\\Extrato Asaas.ofx';
    const ofxContent = fs.readFileSync(ofxPath, 'latin1');
    const ofx = parseOFX(ofxContent);

    console.log('\n' + '='.repeat(100) + '\n');
    console.log(`📂 ARQUIVO OFX (${ofx.length} transações):\n`);

    ofx.slice(0, 30).forEach((t, i) => {
      console.log(`${(i+1).toString().padStart(3)}. [${t.data}] R$ ${t.valor.toString().padStart(10)} | ${t.descricao}`);
    });

    if (ofx.length > 30) {
      console.log(`\n... e mais ${ofx.length - 30} transações`);
    }

    console.log('\n' + '='.repeat(100) + '\n');

    // Análise de sobreposição por data
    const datasBD = new Set(bd.rows.map(r => r.data.toISOString().split('T')[0]));
    const datasOFX = new Set(ofx.map(t => t.data));

    console.log('📅 ANÁLISE POR DATA:\n');
    console.log(`  Datas no BD:  ${[...datasBD].sort().join(', ')}`);
    console.log(`  Datas no OFX: ${[...datasOFX].sort().join(', ')}\n`);

    // Valores totais
    const totalBD = bd.rows.reduce((sum, r) => sum + parseFloat(r.valor), 0);
    const totalOFX = ofx.reduce((sum, t) => sum + t.valor, 0);

    console.log('💰 SOMA DOS VALORES:\n');
    console.log(`  BD:  R$ ${totalBD.toFixed(2)}`);
    console.log(`  OFX: R$ ${totalOFX.toFixed(2)}\n`);

    console.log('='.repeat(100) + '\n');

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

comparar();
