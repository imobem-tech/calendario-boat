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
      descricao: (memo || '').substring(0, 80)
    });
  }

  return transactions;
}

async function encontrar() {
  try {
    console.log('\n🔍 PROCURANDO REGISTRO FALTANTE...\n');

    // Ler OFX
    const ofxPath = 'C:\\\\Users\\\\NOTEBOOK\\\\Downloads\\\\Extrato Asaas.ofx';
    const ofxContent = fs.readFileSync(ofxPath, 'latin1');
    const ofxTransacoes = parseOFX(ofxContent);

    console.log(`📂 OFX: ${ofxTransacoes.length} transações\n`);

    // Buscar FITIDs do BD
    const bd = await pool.query(`
      SELECT id_transacao_banco
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND data >= '2026-09-01'
        AND data <= '2026-09-14'
    `);

    const fitidsBD = new Set(bd.rows.map(r => r.id_transacao_banco));

    console.log(`💾 BD: ${fitidsBD.size} FITIDs\n`);
    console.log('='.repeat(80) + '\n');

    // Comparar
    const faltantes = ofxTransacoes.filter(t => !fitidsBD.has(t.fitid));

    if (faltantes.length === 0) {
      console.log('✅ Nenhum FITID faltando!\n');
      console.log('   (A diferença pode ser um registro extra no BD)\n');
    } else {
      console.log(`❌ FALTAM ${faltantes.length} REGISTRO(S):\n`);

      faltantes.forEach((t, i) => {
        console.log(`${i+1}. FITID: ${t.fitid}`);
        console.log(`   Data: ${t.data}`);
        console.log(`   Valor: R$ ${t.valor.toFixed(2)}`);
        console.log(`   Desc: ${t.descricao}\n`);
      });
    }

    // Verificar se há registros extras no BD
    const fitidsOFX = new Set(ofxTransacoes.map(t => t.fitid));
    const extras = bd.rows.filter(r => !fitidsOFX.has(r.id_transacao_banco));

    if (extras.length > 0) {
      console.log('='.repeat(80) + '\n');
      console.log(`⚠️  REGISTROS EXTRAS NO BD (não estão no OFX):\n`);

      for (const ex of extras) {
        const detalhes = await pool.query(`
          SELECT data, valor, descricao_original, id_transacao_banco
          FROM bank_extratos
          WHERE id_transacao_banco = $1
        `, [ex.id_transacao_banco]);

        const d = detalhes.rows[0];
        if (d) {
          console.log(`   FITID: ${d.id_transacao_banco}`);
          console.log(`   Data: ${d.data.toISOString().split('T')[0]}`);
          console.log(`   Valor: R$ ${d.valor}`);
          console.log(`   Desc: ${d.descricao_original.substring(0, 60)}\n`);
        }
      }
    }

    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

encontrar();
