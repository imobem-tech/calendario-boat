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
    const dtPosted = stmtContent.match(/<DTPOSTED>(.*?)<\/DTPOSTED>/)?.[1];
    const trnAmt = stmtContent.match(/<TRNAMT>(.*?)<\/TRNAMT>/)?.[1];
    const memo = stmtContent.match(/<MEMO>(.*?)<\/MEMO>/)?.[1];
    const dataFormatada = dtPosted ? `${dtPosted.substring(0,4)}-${dtPosted.substring(4,6)}-${dtPosted.substring(6,8)}` : null;
    transactions.push({
      data: dataFormatada,
      valor: parseFloat(trnAmt),
      descricao: (memo || '').substring(0, 80)
    });
  }
  return transactions;
}

async function verificar() {
  try {
    const ofxContent = fs.readFileSync('C:\Users\NOTEBOOK\Downloads\Extrato Asaas.ofx', 'latin1');
    const ofx = parseOFX(ofxContent);
    
    const datasOvl = ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'];
    const ofxDatasOvl = ofx.filter(t => datasOvl.includes(t.data));
    
    console.log(`\n🔍 OFX - Transações nos dias 11-14: ${ofxDatasOvl.length}\n`);
    
    let encontradas = 0;
    for (const t of ofxDatasOvl.slice(0, 20)) {
      const r = await pool.query(`
        SELECT id, descricao_original FROM bank_extratos
        WHERE empresa = 'ALLMAX' AND banco = 'Asaas'
          AND data = $1 AND ABS(valor - $2) < 0.01
      `, [t.data, t.valor]);
      
      if (r.rows.length > 0) {
        encontradas++;
        console.log(`✅ MATCH: ${t.data} | R$ ${t.valor}`);
        console.log(`   OFX: ${t.descricao}`);
        console.log(`   BD:  ${r.rows[0].descricao_original}\n`);
      }
    }
    
    console.log(`\n📊 RESULTADO: ${encontradas} duplicatas encontradas de 20 testadas\n`);
    
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    await pool.end();
  }
}

verificar();
