// ============================================================
// importar-ofx-api.js — V.2609142130
// ENDPOINT PARA IMPORTAR ARQUIVO OFX VIA UPLOAD
// + FIX: Lê agência/conta do arquivo OFX
// + FIX: Identifica empresa automaticamente pela conta
// + FIX: Valida empresa selecionada vs conta do arquivo
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

// Mapeamento de contas Asaas → Empresas
const EMPRESAS_ASAAS = {
  'ALLMAX': {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta_numero: '6327105',
    conta_dv: '0',
    tipo_conta: 'Conta de Pagamento'
  },
  'IMOBEM': {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta_numero: '6576593',
    conta_dv: '5',
    tipo_conta: 'Conta de Pagamento'
  },
  'SUMMER': {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta_numero: '6327037',
    conta_dv: '5',
    tipo_conta: 'Conta de Pagamento'
  }
};

// Mapa reverso: conta → empresa (aceita com ou sem dígito verificador)
const CONTA_PARA_EMPRESA = {
  '6327105': 'ALLMAX',
  '63271050': 'ALLMAX',  // ALLMAX com DV
  '6576593': 'IMOBEM',
  '65765935': 'IMOBEM',  // IMOBEM com DV
  '6327037': 'SUMMER',
  '63270375': 'SUMMER'   // SUMMER com DV
};

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

// Extrair dados bancários do OFX
function extrairDadosBancarios(ofxContent) {
  // <BANKACCTFROM>
  //   <BANKID>461</BANKID>
  //   <ACCTID>6327105</ACCTID>
  //   <ACCTTYPE>CHECKING</ACCTTYPE>
  // </BANKACCTFROM>

  const bankId = ofxContent.match(/<BANKID>(.*?)<\/BANKID>/)?.[1];
  const acctId = ofxContent.match(/<ACCTID>(.*?)<\/ACCTID>/)?.[1];
  const acctType = ofxContent.match(/<ACCTTYPE>(.*?)<\/ACCTTYPE>/)?.[1];

  return {
    banco: bankId || '461',
    conta: acctId,
    tipo_conta: acctType === 'CHECKING' ? 'Conta Corrente' : 'Conta de Pagamento'
  };
}

// Identificar empresa pela conta
function identificarEmpresa(contaNumero) {
  if (!contaNumero) return null;

  // Remover dígito verificador se houver
  const contaLimpa = contaNumero.split('-')[0];

  return CONTA_PARA_EMPRESA[contaLimpa] || null;
}

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

// Importar transação (com dados bancários corretos)
async function importarTransacao(transacao, empresa, dadosBancarios, client) {
  const hash = gerarHash(transacao.data, transacao.valor, transacao.descricao, empresa, transacao.fitid);

  const mesRef = transacao.data.substring(0, 7) + '-01';
  const dataImportacao = transacao.data + ' 00:01:00';

  await client.query(`
    INSERT INTO bank_extratos (
      empresa, banco, codigo_banco, nome_banco, agencia, agencia_dv,
      conta, conta_dv, tipo_conta, data, mes_ref, valor,
      descricao_original, documento, tipo, id_transacao_banco,
      tipo_importacao, hash_unico, importado_em, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )
  `, [
    empresa, 'Asaas', dadosBancarios.banco, dadosBancarios.nome_banco,
    dadosBancarios.agencia, dadosBancarios.agencia_dv, dadosBancarios.conta_numero,
    dadosBancarios.conta_dv, dadosBancarios.tipo_conta, transacao.data,
    mesRef, transacao.valor, transacao.descricao, transacao.documento,
    transacao.tipo, transacao.fitid, 'OFX', hash, dataImportacao, 'PENDENTE'
  ]);
}

// ENDPOINT POST /api/banco/importar-ofx
router.post('/', upload.single('ofx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
    }

    const empresaSelecionada = req.body.empresa || 'ALLMAX';
    const ofxContent = req.file.buffer.toString('latin1');

    // 1. Extrair dados bancários do arquivo OFX
    const dadosOFX = extrairDadosBancarios(ofxContent);

    if (!dadosOFX.conta) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Não foi possível identificar a conta no arquivo OFX'
      });
    }

    // 2. Identificar empresa pela conta
    const empresaIdentificada = identificarEmpresa(dadosOFX.conta);

    if (!empresaIdentificada) {
      return res.status(400).json({
        sucesso: false,
        erro: `Conta ${dadosOFX.conta} não reconhecida! Contas válidas: ${Object.keys(CONTA_PARA_EMPRESA).join(', ')}`
      });
    }

    // 3. Validar se empresa selecionada = empresa identificada
    if (empresaSelecionada !== empresaIdentificada) {
      return res.status(400).json({
        sucesso: false,
        erro: `❌ CONFLITO! Arquivo é da conta ${empresaIdentificada} (${dadosOFX.conta}), mas você selecionou ${empresaSelecionada}!`,
        empresaIdentificada,
        empresaSelecionada,
        conta: dadosOFX.conta
      });
    }

    // 4. Usar dados bancários corretos da empresa
    const dadosBancarios = EMPRESAS_ASAAS[empresaIdentificada];

    console.log(`✅ OFX identificado: Empresa ${empresaIdentificada}, Conta ${dadosOFX.conta}`);

    // 5. Parse OFX
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
          await importarTransacao(transacao, empresaIdentificada, dadosBancarios, client);
          stats.importados++;
        } catch (err) {
          console.error(`Erro ao importar ${transacao.data}:`, err.message);
          stats.erros++;
        }
      }

      // Importar dias após 10 (verificando duplicatas)
      for (const transacao of diasApos10) {
        try {
          const duplicata = await verificarDuplicata(transacao.data, transacao.valor, empresaIdentificada);

          if (duplicata) {
            stats.duplicatas++;
          } else {
            await importarTransacao(transacao, empresaIdentificada, dadosBancarios, client);
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
