// ============================================================
// importar-ofx-api.js — V.2609182005
//
// 🚀 NOVO V.2609182005: Server-Sent Events (SSE) para progresso em tempo real
//    - Endpoint POST /stream com SSE
//    - Frontend recebe eventos: progress, complete, error
//    - Mostra "N de TOTAL" durante importação
//
// 🔥 FIX V.2609181950: Verificar duplicatas em TODOS os dias
//    - PROBLEMA: Dias 01-10 importavam sem verificar duplicatas
//    - RESULTADO: 143 erros ao tentar importar duplicatas
//    - SOLUÇÃO: SEMPRE verificar duplicatas antes de importar
//
// 🔥 FIX V.2609181946: Aceitar conta com dígito verificador
//    - Adicionado 63271050, 65765935, 63270375 no mapa
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

// Importar transação
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

// ============================================================
// FUNÇÃO AUXILIAR: Processar importação OFX
// Retorna { sucesso, stats, erro } e chama onProgress(atual, total, status)
// ============================================================
async function processarImportacaoOFX(ofxContent, empresaSelecionada, onProgress = null) {
  try {
    // 1. Extrair dados bancários
    const dadosOFX = extrairDadosBancarios(ofxContent);
    if (!dadosOFX.conta) {
      throw new Error('Não foi possível identificar a conta no arquivo OFX');
    }

    // 2. Identificar empresa
    const empresaIdentificada = identificarEmpresa(dadosOFX.conta);
    if (!empresaIdentificada) {
      throw new Error(`Conta ${dadosOFX.conta} não reconhecida! Contas válidas: ${Object.keys(CONTA_PARA_EMPRESA).join(', ')}`);
    }

    // 3. Validar empresa
    if (empresaSelecionada !== empresaIdentificada) {
      throw new Error(`❌ CONFLITO! Arquivo é da conta ${empresaIdentificada} (${dadosOFX.conta}), mas você selecionou ${empresaSelecionada}!`);
    }

    // 4. Dados bancários
    const dadosBancarios = EMPRESAS_ASAAS[empresaIdentificada];

    // 5. Parse OFX
    const transacoes = parseOFX(ofxContent);
    if (transacoes.length === 0) {
      throw new Error('Nenhuma transação encontrada no arquivo OFX');
    }

    const stats = {
      totalOFX: transacoes.length,
      importados: 0,
      duplicatas: 0,
      erros: 0
    };

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Processar cada transação com callback de progresso
      for (let i = 0; i < transacoes.length; i++) {
        const transacao = transacoes[i];
        const atual = i + 1;

        try {
          const duplicata = await verificarDuplicata(transacao.data, transacao.valor, empresaIdentificada);

          if (duplicata) {
            stats.duplicatas++;
            if (onProgress) onProgress(atual, transacoes.length, 'duplicata', stats);
          } else {
            await importarTransacao(transacao, empresaIdentificada, dadosBancarios, client);
            stats.importados++;
            if (onProgress) onProgress(atual, transacoes.length, 'importado', stats);
          }
        } catch (err) {
          stats.erros++;
          if (onProgress) onProgress(atual, transacoes.length, 'erro', stats);
          console.error(`[${atual}/${transacoes.length}] Erro:`, err.message);
        }
      }

      await client.query('COMMIT');
      return { sucesso: true, stats };

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

// ============================================================
// ENDPOINT POST /api/banco/importar-ofx (SEM SSE - compatibilidade)
// ============================================================
router.post('/', upload.single('ofx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
    }

    const empresaSelecionada = req.body.empresa || 'ALLMAX';
    const ofxContent = req.file.buffer.toString('latin1');

    const resultado = await processarImportacaoOFX(ofxContent, empresaSelecionada);

    if (resultado.sucesso) {
      res.json({ sucesso: true, stats: resultado.stats });
    } else {
      res.status(400).json({ sucesso: false, erro: resultado.erro });
    }

  } catch (err) {
    console.error('Erro ao importar OFX:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// ENDPOINT POST /api/banco/importar-ofx/stream (COM SSE - progresso em tempo real)
// ============================================================
router.post('/stream', upload.single('ofx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
    }

    // Configurar SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const empresaSelecionada = req.body.empresa || 'ALLMAX';
    const ofxContent = req.file.buffer.toString('latin1');

    // Callback de progresso via SSE
    const enviarProgresso = (atual, total, status, stats) => {
      const percentual = Math.round((atual / total) * 100);
      res.write(`data: ${JSON.stringify({
        tipo: 'progress',
        atual,
        total,
        status,
        percentual,
        stats
      })}\n\n`);
    };

    // Processar com callback
    const resultado = await processarImportacaoOFX(ofxContent, empresaSelecionada, enviarProgresso);

    // Enviar resultado final
    if (resultado.sucesso) {
      res.write(`data: ${JSON.stringify({
        tipo: 'complete',
        stats: resultado.stats
      })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({
        tipo: 'error',
        erro: resultado.erro
      })}\n\n`);
    }

    res.end();

  } catch (err) {
    console.error('Erro ao importar OFX:', err);
    res.write(`data: ${JSON.stringify({
      tipo: 'error',
      erro: err.message
    })}\n\n`);
    res.end();
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
