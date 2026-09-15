import fs from 'fs';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function parseOFX(ofxContent) {
  const transactions = [];
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;

  let match;
  while ((match = stmtRegex.exec(ofxContent)) !== null) {
    const stmtContent = match[1];
    const fitId = stmtContent.match(/<FITID>(.*?)<\/FITID>/)?.[1];
    const dtPosted = stmtContent.match(/<DTPOSTED>(.*?)<\/DTPOSTED>/)?.[1];
    const trnAmt = stmtContent.match(/<TRNAMT>(.*?)<\/TRNAMT>/)?.[1];
    const memo = stmtContent.match(/<MEMO>(.*?)<\/MEMO>/)?.[1];

    const dataFormatada = dtPosted ?
      `${dtPosted.substring(0,4)}-${dtPosted.substring(4,6)}-${dtPosted.substring(6,8)}` :
      null;

    transactions.push({
      fitid: fitId,
      data: dataFormatada,
      valor: parseFloat(trnAmt),
      descricao: memo || ''
    });
  }

  return transactions;
}

async function encontrar() {
  try {
    console.log('\n🔍 PROCURANDO O 1 REGISTRO FALTANTE...\n');

    // Ler OFX
    const ofxPath = 'C:\\\\Users\\\\NOTEBOOK\\\\Downloads\\\\Extrato Asaas.ofx';
    const ofxContent = fs.readFileSync(ofxPath, 'latin1');
    const ofxTransacoes = parseOFX(ofxContent);

    console.log(`📂 OFX: ${ofxTransacoes.length} transações`);

    // Buscar registros do BD (dias 11-14 apenas - onde estão as duplicatas)
    const bd = await pool.query(`
      SELECT data, valor, descricao_original, id_transacao_banco
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND data >= '2026-09-11'
        AND data <= '2026-09-14'
      ORDER BY data, valor
    `);

    console.log(`💾 BD (dias 11-14): ${bd.rows.length} registros\n`);
    console.log('='.repeat(80) + '\n');

    // Filtrar OFX apenas dias 11-14
    const ofxDias11_14 = ofxTransacoes.filter(t => {
      const dia = parseInt(t.data.split('-')[2]);
      return dia >= 11 && dia <= 14;
    });

    console.log(`📊 OFX (dias 11-14): ${ofxDias11_14.length} transações\n`);

    // Para cada transação do OFX, verificar se tem correspondente no BD
    const semCorrespondente = [];

    for (const ofxTrx of ofxDias11_14) {
      // Buscar por DATA + VALOR (±0.01)
      const match = bd.rows.find(bdTrx => {
        const bdData = bdTrx.data.toISOString().split('T')[0];
        const bdValor = parseFloat(bdTrx.valor);

        return bdData === ofxTrx.data && Math.abs(bdValor - ofxTrx.valor) < 0.01;
      });

      if (!match) {
        semCorrespondente.push(ofxTrx);
      }
    }

    if (semCorrespondente.length === 0) {
      console.log('✅ TODOS os registros do OFX (dias 11-14) têm correspondente no BD!\n');
      console.log('   Isso significa que a diferença de 1 vem dos dias 01-10.\n');

      // Verificar dias 01-10
      const ofxDias01_10 = ofxTransacoes.filter(t => {
        const dia = parseInt(t.data.split('-')[2]);
        return dia >= 1 && dia <= 10;
      });

      const bdDias01_10 = await pool.query(`
        SELECT COUNT(*) as total
        FROM bank_extratos
        WHERE empresa = 'ALLMAX'
          AND banco = 'Asaas'
          AND data >= '2026-09-01'
          AND data <= '2026-09-10'
      `);

      console.log(`📊 DIAS 01-10:`);
      console.log(`   OFX: ${ofxDias01_10.length}`);
      console.log(`   BD:  ${bdDias01_10.rows[0].total}\n`);

      if (ofxDias01_10.length > parseInt(bdDias01_10.rows[0].total)) {
        console.log(`   ⚠️  Falta ${ofxDias01_10.length - parseInt(bdDias01_10.rows[0].total)} registro nos dias 01-10!\n`);
      }

    } else {
      console.log(`❌ ENCONTRADO! ${semCorrespondente.length} REGISTRO(S) DO OFX SEM CORRESPONDENTE NO BD:\n`);

      semCorrespondente.forEach((t, i) => {
        console.log(`${i+1}. FITID: ${t.fitid}`);
        console.log(`   Data: ${t.data}`);
        console.log(`   Valor: R$ ${t.valor.toFixed(2)}`);
        console.log(`   Desc: ${t.descricao.substring(0, 80)}\n`);
      });
    }

    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

encontrar();
