// ============================================================
// importar-ofx-api.js — V.2609142100
// ENDPOINT PARA IMPORTAR ARQUIVO OFX VIA UPLOAD
// ============================================================

import express from 'express';
import multer from 'multer';
import pkg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Configurar multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.ofx')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .ofx são permitidos'));
    }
  }
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

  return result.rows.length > 0;
}

// Importar transação
async function importarTransacao(transacao, empresa, client) {
  const hash = gerarHash(transacao.data, transacao.valor, transacao.descricao, empresa, transacao.fitid);

  const dadosBancarios = {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta: '6327105',
    conta_dv: '0',
    tipo_conta: 'Conta de Pagamento'
  };

  const mesRef = transacao.data.substring(0, 7) + '-01';
  const dataImportacao = transacao.data + ' 00:01:00';

  await client.query(`
    INSERT INTO bank_extratos (
      empresa, banco, codigo_banco, nome_banco, agencia, agencia_dv,
      conta, conta_dv, tipo_conta, data, mes_ref, valor,
      descricao_original, documento, tipo, id_transacao_banco,
      tipo_importacao, hash_unico, importado_em
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
  `, [
    empresa, 'Asaas', dadosBancarios.banco, dadosBancarios.nome_banco,
    dadosBancarios.agencia, dadosBancarios.agencia_dv, dadosBancarios.conta,
    dadosBancarios.conta_dv, dadosBancarios.tipo_conta, transacao.data,
    mesRef, transacao.valor, transacao.descricao, transacao.documento,
    transacao.tipo, transacao.fitid, 'OFX', hash, dataImportacao
  ]);
}

// ENDPOINT POST /api/banco/importar-ofx
router.post('/', upload.single('ofx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
    }

    const empresa = req.body.empresa || 'ALLMAX';
    const ofxContent = req.file.buffer.toString('latin1');

    // Parse OFX
    const transacoes = parseOFX(ofxContent);

    if (transacoes.length === 0) {
      return res.status(400).json({ sucesso: false, erro: 'Nenhuma transação encontrada no arquivo OFX' });
    }

    // Separar por período (dias 01-10 e 11-31)
    const dias01_10 = transacoes.filter(t => {
      const dia = parseInt(t.data.split('-')[2]);
      return dia >= 1 && dia <= 10;
    });

    const diasApos10 = transacoes.filter(t => {
      const dia = parseInt(t.data.split('-')[2]);
      return dia > 10;
    });

    const stats = {
      totalOFX: transacoes.length,
      importados: 0,
      duplicatas: 0,
      erros: 0
    };

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Importar dias 01-10 (sem verificar duplicatas)
      for (const transacao of dias01_10) {
        try {
          await importarTransacao(transacao, empresa, client);
          stats.importados++;
        } catch (err) {
          console.error(`Erro ao importar ${transacao.data}:`, err.message);
          stats.erros++;
        }
      }

      // Importar dias após 10 (verificando duplicatas)
      for (const transacao of diasApos10) {
        try {
          const duplicata = await verificarDuplicata(transacao.data, transacao.valor, empresa);

          if (duplicata) {
            stats.duplicatas++;
          } else {
            await importarTransacao(transacao, empresa, client);
            stats.importados++;
          }
        } catch (err) {
          console.error(`Erro ao processar ${transacao.data}:`, err.message);
          stats.erros++;
        }
      }

      await client.query('COMMIT');

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ sucesso: true, stats });

  } catch (err) {
    console.error('Erro ao importar OFX:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
