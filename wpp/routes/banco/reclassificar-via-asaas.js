// ============================================================
// Reclassificação via API Asaas
// V.260912021500
// ============================================================
//
// FUNCIONALIDADE:
// - Busca cobranças classificadas como "Contas de Terceiro rec"
// - Para cada uma, busca detalhes na API Asaas
// - Reclassifica baseado na descrição real do Asaas
// - Preenche campo observação com a descrição
//
// REGRAS:
// 1. Se description contém "aluguel"/"locação" → "Aluguel em geral"
// 2. Se contém palavras de imóvel → "Prestação Imóvel"
// 3. Caso contrário → mantém "Contas de Terceiro rec"
//
// ============================================================

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// API Keys por empresa
const API_KEYS = {
  'ALLMAX': process.env.ASAAS_API_KEY_ALLMAX,
  'IMOBEM': process.env.ASAAS_API_KEY_IMOBEM,
  'IMOBAN': process.env.ASAAS_API_KEY_IMOBAN,
  'SUMMER': process.env.ASAAS_API_KEY_SUMMER
};

/**
 * Busca detalhes da cobrança na API Asaas
 */
async function buscarCobrancaAsaas(faturaId, empresa) {
  const apiKey = API_KEYS[empresa];

  if (!apiKey) {
    console.error(`  ❌ API Key não encontrada para empresa ${empresa}`);
    return null;
  }

  try {
    const url = `https://www.asaas.com/api/v3/payments/${faturaId}`;

    const response = await fetch(url, {
      headers: {
        'access_token': apiKey
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  ⚠️ Cobrança ${faturaId} não encontrada no Asaas`);
        return null;
      }
      const error = await response.text();
      console.error(`  ❌ Erro API (${response.status}):`, error);
      return null;
    }

    const payment = await response.json();
    return payment;

  } catch (err) {
    console.error(`  ❌ Erro ao chamar API:`, err.message);
    return null;
  }
}

/**
 * Determina classificação baseada nos dados do Asaas
 */
function determinarClassificacaoAsaas(payment) {
  const description = (payment.description || '').toUpperCase();
  const externalRef = (payment.externalReference || '').toUpperCase();
  const combinado = `${description} ${externalRef}`;

  // REGRA 1: Aluguel
  if (combinado.includes('ALUGUEL') || combinado.includes('LOCAÇÃO') || combinado.includes('LOCACAO')) {
    return {
      categoriaId: 32,
      categoriaNome: 'Aluguel em geral',
      confianca: 0.95,
      motivo: 'API Asaas: descrição contém "aluguel"'
    };
  }

  // REGRA 2: Prestação Imóvel
  const palavrasImovel = [
    'LOTE', 'QUADRA', 'LOTEAMENTO', 'DOCE VIDA', 'DOCE_VIDA',
    'CLÁUSULA', 'CLAUSULA', 'ETAPA', 'FOCKER', 'PRATA',
    'IMOVEL', 'IMÓVEL', 'VENDA', 'PARCELA', 'PRESTAÇÃO', 'PRESTACAO'
  ];

  const temPalavraImovel = palavrasImovel.some(palavra => combinado.includes(palavra));
  const temParcela = /\d+\/\d+/.test(combinado);

  if (temPalavraImovel || temParcela) {
    return {
      categoriaId: 20,
      categoriaNome: 'Prestação Imóvel',
      confianca: 0.90,
      motivo: 'API Asaas: descrição indica venda de imóvel'
    };
  }

  // REGRA 3: Mantém como Contas de Terceiro
  return {
    categoriaId: 33,
    categoriaNome: 'Contas de Terceiro rec',
    confianca: 0.80,
    motivo: 'API Asaas: não identificado como aluguel ou venda'
  };
}

/**
 * Reclassifica uma transação via API Asaas
 */
async function reclassificarTransacao(extrato) {
  console.log(`\n[${extrato.id}] ${extrato.descricao_original.substring(0, 60)}...`);
  console.log(`  Valor: R$ ${extrato.valor}`);
  console.log(`  Classificação atual: ${extrato.classificacao}`);

  // Extrair número da fatura (CHECKNUM do OFX)
  const camposExtras = extrato.campos_extras || {};
  const checkNum = camposExtras.checkNum;

  if (!checkNum) {
    console.log(`  ⚠️ Sem número de fatura (checkNum)`);
    return { status: 'sem_fatura' };
  }

  console.log(`  📄 Fatura Asaas: ${checkNum}`);

  // Buscar na API Asaas
  const payment = await buscarCobrancaAsaas(checkNum, extrato.empresa);

  if (!payment) {
    return { status: 'nao_encontrado' };
  }

  console.log(`  ✅ Dados Asaas:`);
  console.log(`     Description: ${payment.description || 'Não informado'}`);
  console.log(`     External Ref: ${payment.externalReference || 'Não informado'}`);
  console.log(`     Value: R$ ${payment.value}`);
  console.log(`     Status: ${payment.status}`);

  // Determinar nova classificação
  const result = determinarClassificacaoAsaas(payment);

  console.log(`  💡 ${result.motivo}`);
  console.log(`  📊 Nova classificação: ${result.categoriaNome} (${(result.confianca * 100).toFixed(0)}%)`);

  // Montar observação
  const observacao = payment.description || payment.externalReference || null;

  // Atualizar no banco
  await pool.query(`
    UPDATE bank_extratos
    SET classificacao = $1,
        classificacao_manual = false,
        confianca = $2,
        observacoes = $3,
        campos_extras = jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(campos_extras, '{}'::jsonb),
              '{metodo_classificacao}',
              '"api_asaas"'
            ),
            '{categoria_id}',
            $4::text::jsonb
          ),
          '{asaas_payment}',
          $5::jsonb
        )
    WHERE id = $6
  `, [
    result.categoriaNome,
    result.confianca,
    observacao,
    result.categoriaId,
    JSON.stringify({
      description: payment.description,
      externalReference: payment.externalReference,
      status: payment.status,
      billingType: payment.billingType
    }),
    extrato.id
  ]);

  return {
    status: 'atualizado',
    categoriaId: result.categoriaId,
    categoriaNome: result.categoriaNome
  };
}

/**
 * Processa todas as transações
 */
async function processarTodas(empresa) {
  console.log(`🔍 Buscando transações para reclassificar (${empresa})...\n`);

  const result = await pool.query(`
    SELECT
      id,
      empresa,
      descricao_original,
      valor,
      classificacao,
      campos_extras
    FROM bank_extratos
    WHERE tipo_importacao = 'MANUAL_OFX'
      AND empresa = $1
      AND tipo = 'CREDITO'
      AND classificacao = 'Contas de Terceiro rec'
    ORDER BY data, id
  `, [empresa]);

  console.log(`📊 Total de cobranças encontradas: ${result.rows.length}\n`);

  if (result.rows.length === 0) {
    console.log('⚠️ Nenhuma transação para reclassificar');
    return;
  }

  const stats = {
    total: result.rows.length,
    atualizado: 0,
    nao_encontrado: 0,
    sem_fatura: 0,
    porCategoria: {}
  };

  for (const extrato of result.rows) {
    const res = await reclassificarTransacao(extrato);
    stats[res.status]++;

    if (res.categoriaId) {
      stats.porCategoria[res.categoriaNome] =
        (stats.porCategoria[res.categoriaNome] || 0) + 1;
    }

    // Pequeno delay para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Relatório
  console.log('\n\n========================================');
  console.log('📊 RELATÓRIO DE RECLASSIFICAÇÃO');
  console.log('========================================');
  console.log(`Empresa: ${empresa}`);
  console.log(`Total processado: ${stats.total}`);
  console.log(`  ✅ Atualizadas: ${stats.atualizado}`);
  console.log(`  ⚠️ Não encontradas no Asaas: ${stats.nao_encontrado}`);
  console.log(`  ⚠️ Sem número de fatura: ${stats.sem_fatura}`);
  console.log('');

  if (Object.keys(stats.porCategoria).length > 0) {
    console.log('Novas classificações:');
    Object.entries(stats.porCategoria).forEach(([nome, count]) => {
      console.log(`  ${nome}: ${count}`);
    });
  }

  console.log('========================================\n');
}

// EXECUÇÃO
const EMPRESA = 'IMOBEM';

console.log('🚀 Reclassificação via API Asaas\n');

// Verificar se tem API key
if (!API_KEYS[EMPRESA]) {
  console.error(`❌ API Key não encontrada para ${EMPRESA}`);
  console.error(`\nAdicione no .env:`);
  console.error(`ASAAS_API_KEY_${EMPRESA}=sua_chave_aqui\n`);
  process.exit(1);
}

console.log(`✅ API Key encontrada para ${EMPRESA}\n`);

processarTodas(EMPRESA)
  .then(() => {
    console.log('✅ Reclassificação concluída!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
