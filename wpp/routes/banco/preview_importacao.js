// ============================================================
// preview_importacao.js — V.2609141825
// PREVIEW DA IMPORTAÇÃO - CONTAGEM PREVISTA
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

    const dtPosted = stmtContent.match(/<DTPOSTED>(.*?)<\/DTPOSTED>/)?.[1];
    const trnAmt = stmtContent.match(/<TRNAMT>(.*?)<\/TRNAMT>/)?.[1];

    const dataFormatada = dtPosted ?
      `${dtPosted.substring(0,4)}-${dtPosted.substring(4,6)}-${dtPosted.substring(6,8)}` :
      null;

    transactions.push({
      data: dataFormatada,
      valor: parseFloat(trnAmt)
    });
  }

  return transactions;
}

async function preview() {
  try {
    console.log('🔮 PREVIEW DA IMPORTAÇÃO\n');
    console.log('='.repeat(80) + '\n');

    // Ler OFX
    const ofxPath = 'C:\\\\Users\\\\NOTEBOOK\\\\Downloads\\\\Extrato Asaas.ofx';
    const ofxContent = fs.readFileSync(ofxPath, 'latin1');
    const transacoes = parseOFX(ofxContent);

    console.log(`📂 ARQUIVO OFX:\n`);
    console.log(`  Total de transações: ${transacoes.length}\n`);

    // Contar por data
    const porData = {};
    transacoes.forEach(t => {
      porData[t.data] = (porData[t.data] || 0) + 1;
    });

    console.log('📅 DISTRIBUIÇÃO POR DATA:\n');

    Object.entries(porData).sort().forEach(([data, qtd]) => {
      console.log(`  ${data}: ${qtd.toString().padStart(3)} transações`);
    });

    // Separar períodos
    const dias01_10 = transacoes.filter(t => {
      const dia = parseInt(t.data.split('-')[2]);
      return dia >= 1 && dia <= 10;
    });

    const dias11_14 = transacoes.filter(t => {
      const dia = parseInt(t.data.split('-')[2]);
      return dia >= 11 && dia <= 14;
    });

    console.log('\n' + '='.repeat(80) + '\n');
    console.log('📊 PERÍODOS:\n');
    console.log(`  Dias 01-10: ${dias01_10.length} transações`);
    console.log(`  Dias 11-14: ${dias11_14.length} transações\n`);

    // Buscar estado atual do BD
    const bd = await pool.query(`
      SELECT
        data,
        COUNT(*) as qtd
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND data >= '2026-09-01'
        AND data <= '2026-09-14'
      GROUP BY data
      ORDER BY data
    `);

    console.log('='.repeat(80) + '\n');
    console.log('💾 BANCO DE DADOS ATUAL:\n');

    const totalBD = bd.rows.reduce((sum, r) => sum + parseInt(r.qtd), 0);

    bd.rows.forEach(r => {
      const dataF = r.data.toISOString().split('T')[0];
      console.log(`  ${dataF}: ${r.qtd.toString().padStart(3)} registros`);
    });

    console.log(`\n  Total no BD: ${totalBD}\n`);

    // Calcular previsão
    console.log('='.repeat(80) + '\n');
    console.log('🔮 PREVISÃO PÓS-IMPORTAÇÃO (Opção A):\n');
    console.log('   Estratégia: Importar apenas dias 01-10\n');

    const aImportar = dias01_10.length;
    const jaExiste = totalBD;
    const totalPrevisto = aImportar + jaExiste;

    console.log(`  ✅ Será importado (01-10):  ${aImportar}`);
    console.log(`  📌 Já existe no BD (11-14): ${jaExiste}`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  📊 TOTAL PREVISTO NO BD:    ${totalPrevisto}\n`);

    console.log('  📂 TOTAL NO OFX:            ${transacoes.length}\n');

    const diferenca = transacoes.length - totalPrevisto;

    if (diferenca === 0) {
      console.log('  ✅ PERFEITO! Vai bater exatamente!\n');
    } else if (Math.abs(diferenca) <= 10) {
      console.log(`  ⚠️  DIFERENÇA PEQUENA: ${Math.abs(diferenca)} registros`);
      console.log(`     Motivo provável: ${diferenca > 0 ? 'Duplicatas nos dias 11-14' : 'Webhooks extras no BD'}\n`);
    } else {
      console.log(`  ❌ DIFERENÇA GRANDE: ${Math.abs(diferenca)} registros`);
      console.log(`     Precisamos investigar!\n`);
    }

    // Análise detalhada dias 11-14
    console.log('='.repeat(80) + '\n');
    console.log('🔍 ANÁLISE DETALHADA DIAS 11-14:\n');

    for (const row of bd.rows) {
      const dataF = row.data.toISOString().split('T')[0];
      const dia = parseInt(dataF.split('-')[2]);

      if (dia >= 11 && dia <= 14) {
        const qtdOFX = porData[dataF] || 0;
        const qtdBD = parseInt(row.qtd);
        const diff = qtdOFX - qtdBD;

        console.log(`  ${dataF}:`);
        console.log(`    OFX: ${qtdOFX} | BD: ${qtdBD} | Diferença: ${diff >= 0 ? '+' : ''}${diff}`);

        if (diff > 0) {
          console.log(`    → Faltam ${diff} transações no BD (possíveis duplicatas)`);
        } else if (diff < 0) {
          console.log(`    → BD tem ${Math.abs(diff)} a mais (webhooks extras?)`);
        } else {
          console.log(`    → ✅ Batendo!`);
        }
        console.log('');
      }
    }

    console.log('='.repeat(80) + '\n');
    console.log('📋 CONCLUSÃO:\n');

    if (diferenca >= 0 && diferenca <= dias11_14.length * 0.3) {
      console.log('  ✅ A diferença está dentro do esperado!');
      console.log('     As duplicatas nos dias 11-14 explicam a diferença.\n');
      console.log('  🎯 RECOMENDAÇÃO: Prosseguir com importação dos dias 01-10!\n');
    } else if (diferenca < 0) {
      console.log('  ⚠️  BD tem MAIS registros que o OFX!');
      console.log('     Possível causa: Webhooks chegaram após geração do OFX.\n');
      console.log('  🎯 RECOMENDAÇÃO: Importar mesmo assim, vai complementar!\n');
    } else {
      console.log('  ⚠️  Diferença maior que o esperado.');
      console.log('     Revisar manualmente antes de importar.\n');
    }

    await pool.end();

  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

preview();
