// ============================================================
// Script de Importação OFX Asaas → bank_extratos
// V.260912012000
// ============================================================
//
// FUNCIONALIDADE:
// - Lê arquivo OFX do Asaas (extrato bancário)
// - Processa cada transação
// - Consulta Cliente e Contas_Receber para classificação automática
// - Insere em bank_extratos
//
// REGRAS DE CLASSIFICAÇÃO:
// 1. CREDIT (Cobrança recebida):
//    - Busca cliente pelo nome no MEMO
//    - Busca em Contas_Receber por CPF + valor
//    - Classifica conforme tipo da cobrança
//
// 2. FEE (Taxas):
//    - Classifica como "Despesa Bancária - Taxas"
//
// 3. XFER (Transferência):
//    - Se destino = IMOBEM → "Transferência Interna"
//    - Caso contrário → NULL (classificação manual)
//
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Parse simples de arquivo OFX
 */
function parseOFX(conteudo) {
  const transacoes = [];

  // Extrair informações da conta
  const acctIdMatch = conteudo.match(/<ACCTID>(.*?)<\/?\n/);
  const acctTypeMatch = conteudo.match(/<ACCTTYPE>(.*?)<\/?\n/);
  const bankIdMatch = conteudo.match(/<BANKID>(.*?)<\/?\n/);
  const orgMatch = conteudo.match(/<ORG>(.*?)<\/?\n/);

  const conta = acctIdMatch ? acctIdMatch[1].trim() : null;
  const tipoConta = acctTypeMatch ? acctTypeMatch[1].trim() : 'CHECKING';
  const codigoBanco = bankIdMatch ? bankIdMatch[1].trim() : '461';
  const nomeBanco = orgMatch ? orgMatch[1].trim() : 'ASAAS Gestao Financeira Instituicao de Pagamento S.A.';

  // Extrair cada transação (STMTTRN)
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let match;

  while ((match = regex.exec(conteudo)) !== null) {
    const trn = match[1];

    // Extrair campos
    const trnType = (trn.match(/<TRNTYPE>(.*?)(?:<|\n)/) || [])[1]?.trim();
    const dtPosted = (trn.match(/<DTPOSTED>(.*?)(?:<|\n)/) || [])[1]?.trim();
    const trnAmt = (trn.match(/<TRNAMT>(.*?)(?:<|\n)/) || [])[1]?.trim();
    const fitId = (trn.match(/<FITID>(.*?)(?:<|\n)/) || [])[1]?.trim();
    const checkNum = (trn.match(/<CHECKNUM>(.*?)(?:<|\n)/) || [])[1]?.trim();
    const memo = (trn.match(/<MEMO>(.*?)(?:<|\n)/) || [])[1]?.trim();

    if (trnType && dtPosted && trnAmt && fitId) {
      transacoes.push({
        trnType,
        dtPosted,
        trnAmt: parseFloat(trnAmt),
        fitId,
        checkNum: checkNum || null,
        memo: memo || '',
        // Dados da conta
        conta,
        tipoConta,
        codigoBanco,
        nomeBanco
      });
    }
  }

  return transacoes;
}

/**
 * Converte data OFX (YYYYMMDD) para formato PostgreSQL (YYYY-MM-DD)
 */
function converterData(dataOFX) {
  if (!dataOFX || dataOFX.length !== 8) return null;
  const ano = dataOFX.substring(0, 4);
  const mes = dataOFX.substring(4, 6);
  const dia = dataOFX.substring(6, 8);
  return `${ano}-${mes}-${dia}`;
}

/**
 * Extrai nome do cliente do MEMO
 */
function extrairNomeCliente(memo) {
  // PATTERN: "Cobranca recebida - fatura nr. 871536621 MARIA DA CONCEICAO NONATO DE AQUINO"
  // PATTERN: "Taxa de boleto - fatura nr. 734925628 ALEX RODRIGUES FERNANDES"

  // Tentar extrair após número da fatura
  const match = memo.match(/fatura nr\.\s+\d+\s+(.+)/i);
  if (match) {
    return match[1].trim();
  }

  // Se não encontrou, tentar extrair tudo após "para"
  const matchPara = memo.match(/para\s+(.+)/i);
  if (matchPara) {
    return matchPara[1].trim();
  }

  return null;
}

/**
 * Busca cliente na tabela Cliente pelo nome (aceita parcial)
 */
async function buscarClientePorNome(nome) {
  if (!nome) return null;

  try {
    // Tentar busca exata primeiro
    let result = await pool.query(`
      SELECT "ID", "Cliente_Nome", "Cliente_CPF"
      FROM "Cliente"
      WHERE UPPER("Cliente_Nome") = UPPER($1)
      LIMIT 1
    `, [nome]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Busca parcial (LIKE)
    result = await pool.query(`
      SELECT "ID", "Cliente_Nome", "Cliente_CPF"
      FROM "Cliente"
      WHERE UPPER("Cliente_Nome") LIKE UPPER($1)
      LIMIT 1
    `, [`%${nome}%`]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Busca por palavras individuais (se o nome tiver mais de 2 palavras)
    const palavras = nome.split(' ').filter(p => p.length > 3); // Palavras com mais de 3 letras
    if (palavras.length >= 2) {
      const primeiroNome = palavras[0];
      const ultimoNome = palavras[palavras.length - 1];

      result = await pool.query(`
        SELECT "ID", "Cliente_Nome", "Cliente_CPF"
        FROM "Cliente"
        WHERE UPPER("Cliente_Nome") LIKE UPPER($1)
          AND UPPER("Cliente_Nome") LIKE UPPER($2)
        LIMIT 1
      `, [`%${primeiroNome}%`, `%${ultimoNome}%`]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }
    }

    return null;
  } catch (err) {
    console.error(`❌ Erro ao buscar cliente ${nome}:`, err.message);
    return null;
  }
}

/**
 * Busca cobrança em Contas_Receber por CPF e valor (±2%)
 */
async function buscarCobrancaPorCpfValor(cpf, valor) {
  if (!cpf) return null;

  try {
    const valorMin = valor * 0.98; // -2%
    const valorMax = valor * 1.02; // +2%

    const result = await pool.query(`
      SELECT cr."ID", cr."Descrição", cr."Total", cr."Nro_Venda", cr."Centro_Custo"
      FROM "Contas_Receber" cr
      WHERE cr."CPF_CNPJ_CR" = $1
        AND cr."Total" BETWEEN $2 AND $3
      ORDER BY ABS(cr."Total" - $4)
      LIMIT 1
    `, [cpf, valorMin, valorMax, valor]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    return null;
  } catch (err) {
    console.error(`❌ Erro ao buscar cobrança CPF ${cpf} valor ${valor}:`, err.message);
    return null;
  }
}

/**
 * Determina classificação baseada no tipo da transação
 */
async function determinarClassificacao(trn, nomeCliente) {
  // 1. FEE - Taxas bancárias
  if (trn.trnType === 'FEE') {
    return {
      classificacao: 'Despesa Bancária - Taxas',
      confianca: 1.0,
      metodo: 'auto_fee'
    };
  }

  // 2. XFER - Transferências
  if (trn.trnType === 'XFER') {
    // Só classifica como interna se for para IMOBEM
    if (trn.memo.toUpperCase().includes('IMOBEM')) {
      return {
        classificacao: 'Transferência Interna',
        confianca: 0.95,
        metodo: 'auto_xfer_interna'
      };
    }
    // Outras transferências: não classificar
    return {
      classificacao: null,
      confianca: 0,
      metodo: 'manual_whatsapp'
    };
  }

  // 3. CREDIT - Cobranças recebidas
  if (trn.trnType === 'CREDIT' && nomeCliente) {
    // Buscar cliente
    const cliente = await buscarClientePorNome(nomeCliente);

    if (!cliente || !cliente.Cliente_CPF) {
      console.log(`⚠️ Cliente não encontrado: ${nomeCliente}`);
      return {
        classificacao: null,
        confianca: 0,
        metodo: 'cliente_nao_encontrado',
        cliente_buscado: nomeCliente
      };
    }

    console.log(`✅ Cliente encontrado: ${cliente.Cliente_Nome} (CPF: ${cliente.Cliente_CPF})`);

    // Buscar cobrança por CPF e valor
    const cobranca = await buscarCobrancaPorCpfValor(cliente.Cliente_CPF, trn.trnAmt);

    if (cobranca) {
      console.log(`✅ Cobrança encontrada: ${cobranca.Descrição} (R$ ${cobranca.Total})`);

      // Classificar conforme tipo da cobrança
      let classificacao = 'Receita - Outros';
      let confianca = 0.80;

      // REGRA 1: Se tem Nro_Venda → Venda de Imóvel
      if (cobranca.Nro_Venda) {
        classificacao = 'Receita - Venda de Imóvel';
        confianca = 0.95;
        console.log(`  💡 Tem Nro_Venda (${cobranca.Nro_Venda}) → ${classificacao}`);
      }
      // REGRA 2: Analisar Descrição
      else if (cobranca.Descrição) {
        const desc = cobranca.Descrição.toLowerCase();

        if (desc.includes('aluguel') || desc.includes('locação') || desc.includes('locacao')) {
          classificacao = 'Receita - Aluguel';
          confianca = 0.90;
          console.log(`  💡 Descrição contém "aluguel" → ${classificacao}`);
        } else if (desc.includes('imovel') || desc.includes('imóvel') || desc.includes('venda')) {
          classificacao = 'Receita - Venda de Imóvel';
          confianca = 0.85;
          console.log(`  💡 Descrição contém "venda/imóvel" → ${classificacao}`);
        } else {
          console.log(`  ⚠️ Descrição não identificada: "${cobranca.Descrição}"`);
        }
      }

      return {
        classificacao,
        confianca,
        metodo: 'auto_cruzamento_cpf_valor',
        cliente_id: cliente.ID,
        cliente_nome: cliente.Cliente_Nome,
        cliente_cpf: cliente.Cliente_CPF,
        cobranca_id: cobranca.ID,
        cobranca_descricao: cobranca.Descrição,
        nro_venda: cobranca.Nro_Venda || null
      };
    } else {
      console.log(`⚠️ Cobrança não encontrada para CPF ${cliente.Cliente_CPF} e valor R$ ${trn.trnAmt}`);
      return {
        classificacao: null,
        confianca: 0,
        metodo: 'cobranca_nao_encontrada',
        cliente_id: cliente.ID,
        cliente_nome: cliente.Cliente_Nome,
        cliente_cpf: cliente.Cliente_CPF
      };
    }
  }

  // Sem classificação
  return {
    classificacao: null,
    confianca: 0,
    metodo: 'nao_classificado'
  };
}

/**
 * Insere lançamento no banco de dados
 */
async function inserirLancamento(lanc) {
  const query = `
    INSERT INTO bank_extratos (
      empresa, banco, codigo_banco, nome_banco,
      conta, tipo_conta,
      data, mes_ref, valor, descricao_original, documento, tipo,
      cpf_cnpj_origem, nome_origem,
      id_transacao_banco, tipo_importacao,
      classificacao, classificacao_manual, confianca,
      hash_unico, campos_extras, importado_em
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6,
      $7, DATE_TRUNC('month', $7::DATE), $8, $9, $10, $11,
      $12, $13,
      $14, $15,
      $16, $17, $18,
      $19, $20::jsonb, NOW() AT TIME ZONE 'America/Sao_Paulo'
    )
    ON CONFLICT (hash_unico) DO NOTHING
    RETURNING id
  `;

  const valores = [
    lanc.empresa, lanc.banco, lanc.codigo_banco, lanc.nome_banco,
    lanc.conta, lanc.tipo_conta,
    lanc.data, lanc.valor, lanc.descricao_original, lanc.documento, lanc.tipo,
    lanc.cpf_cnpj_origem, lanc.nome_origem,
    lanc.id_transacao_banco, lanc.tipo_importacao,
    lanc.classificacao, lanc.classificacao_manual, lanc.confianca,
    lanc.hash_unico, lanc.campos_extras
  ];

  const result = await pool.query(query, valores);
  return result.rowCount > 0;
}

/**
 * Processa uma transação OFX
 */
async function processarTransacao(trn, empresa) {
  // Converter data
  const data = converterData(trn.dtPosted);

  // Determinar tipo (CREDITO/DEBITO)
  const tipo = trn.trnAmt > 0 ? 'CREDITO' : 'DEBITO';

  // Extrair nome do cliente (se houver)
  const nomeCliente = extrairNomeCliente(trn.memo);

  // Determinar classificação
  const classInfo = await determinarClassificacao(trn, nomeCliente);

  // Montar objeto do lançamento
  const lancamento = {
    empresa,
    banco: 'Asaas',
    codigo_banco: trn.codigoBanco,
    nome_banco: trn.nomeBanco,
    conta: trn.conta,
    tipo_conta: trn.tipoConta === 'CHECKING' ? 'CORRENTE' : trn.tipoConta,

    data,
    valor: trn.trnAmt,
    descricao_original: trn.memo,
    documento: trn.checkNum,
    tipo,

    cpf_cnpj_origem: classInfo.cliente_cpf || null,
    nome_origem: classInfo.cliente_nome || nomeCliente || null,

    id_transacao_banco: trn.fitId,
    tipo_importacao: 'MANUAL_OFX',

    classificacao: classInfo.classificacao,
    classificacao_manual: classInfo.classificacao ? false : null,
    confianca: classInfo.confianca,

    campos_extras: JSON.stringify({
      trnType: trn.trnType,
      checkNum: trn.checkNum,
      metodo_classificacao: classInfo.metodo,
      cliente_id: classInfo.cliente_id || null,
      cobranca_id: classInfo.cobranca_id || null,
      observacao: classInfo.cobranca_descricao || null
    })
  };

  // Gerar hash único (evitar duplicatas)
  const hashString = `${lancamento.codigo_banco}-${lancamento.data}-${Math.abs(lancamento.valor)}-${lancamento.id_transacao_banco}`;
  lancamento.hash_unico = crypto.createHash('md5').update(hashString).digest('hex');

  return { lancamento, classInfo };
}

/**
 * Importa arquivo OFX
 */
async function importarOFX(caminhoArquivo, empresa) {
  console.log('📄 Lendo arquivo OFX:', caminhoArquivo);

  // Ler arquivo
  const conteudo = fs.readFileSync(caminhoArquivo, 'utf-8');

  // Parse OFX
  console.log('🔍 Fazendo parse do OFX...');
  const transacoes = parseOFX(conteudo);

  console.log(`📊 Total de transações encontradas: ${transacoes.length}`);
  console.log('');

  // Estatísticas
  const stats = {
    total: transacoes.length,
    inseridas: 0,
    duplicadas: 0,
    classificadas_auto: 0,
    nao_classificadas: 0,
    erros: 0,
    porTipo: {}
  };

  // Processar cada transação
  for (let i = 0; i < transacoes.length; i++) {
    const trn = transacoes[i];

    console.log(`\n[${i + 1}/${transacoes.length}] Processando transação:`);
    console.log(`  Data: ${converterData(trn.dtPosted)}`);
    console.log(`  Tipo: ${trn.trnType}`);
    console.log(`  Valor: R$ ${trn.trnAmt.toFixed(2)}`);
    console.log(`  MEMO: ${trn.memo.substring(0, 60)}...`);

    try {
      const { lancamento, classInfo } = await processarTransacao(trn, empresa);

      // Tentar inserir
      const inserido = await inserirLancamento(lancamento);

      if (inserido) {
        stats.inseridas++;
        if (classInfo.classificacao) {
          stats.classificadas_auto++;
          console.log(`  ✅ Inserido e classificado: ${classInfo.classificacao}`);
        } else {
          stats.nao_classificadas++;
          console.log(`  ✅ Inserido (sem classificação - ${classInfo.metodo})`);
        }
      } else {
        stats.duplicadas++;
        console.log(`  ⏭️  Duplicada (hash já existe)`);
      }

      // Contabilizar por tipo
      stats.porTipo[trn.trnType] = (stats.porTipo[trn.trnType] || 0) + 1;

    } catch (err) {
      stats.erros++;
      console.error(`  ❌ Erro:`, err.message);
    }
  }

  // Relatório final
  console.log('\n\n========================================');
  console.log('📊 RELATÓRIO DE IMPORTAÇÃO');
  console.log('========================================');
  console.log(`Empresa: ${empresa}`);
  console.log(`Arquivo: ${path.basename(caminhoArquivo)}`);
  console.log('');
  console.log(`Total de transações: ${stats.total}`);
  console.log(`  ✅ Inseridas: ${stats.inseridas}`);
  console.log(`  ⏭️  Duplicadas: ${stats.duplicadas}`);
  console.log(`  ❌ Erros: ${stats.erros}`);
  console.log('');
  console.log('Classificação:');
  console.log(`  🤖 Automática: ${stats.classificadas_auto}`);
  console.log(`  👤 Manual (WhatsApp): ${stats.nao_classificadas}`);
  console.log('');
  console.log('Por tipo de transação:');
  Object.entries(stats.porTipo).forEach(([tipo, count]) => {
    console.log(`  ${tipo}: ${count}`);
  });
  console.log('========================================\n');
}

// ============================================================
// EXECUÇÃO
// ============================================================

const EMPRESA = 'IMOBEM';
const ARQUIVO_OFX = 'D:\\OneDrive\\GESTAO_DZ\\-¢-\\OUTROS\\EXTRATO\\2026-08-IMOBEM-Asaas-C_CORRENTE.ofx';

console.log('🚀 Iniciando importação OFX → bank_extratos');
console.log('');

importarOFX(ARQUIVO_OFX, EMPRESA)
  .then(() => {
    console.log('✅ Importação concluída!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
