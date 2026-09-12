// ============================================================
// Classificação Final - Importação OFX IMOBEM
// V.260912020000
// ============================================================
//
// REGRAS DE CLASSIFICAÇÃO (baseadas na descrição do OFX):
//
// 1. Se descrição contém "aluguel" ou "locação":
//    → ID 32 - "Aluguel em geral"
//
// 2. Se descrição contém palavras de venda de imóvel:
//    → ID 20 - "Prestação Imóvel"
//    Palavras: LOTE, QUADRA, LOTEAMENTO, DOCE VIDA, CLÁUSULA, ETAPA, /XX (parcelas)
//
// 3. Caso contrário:
//    → ID 33 - "Contas de Terceiro rec"
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

/**
 * Determina classificação baseada na descrição
 */
function determinarClassificacao(descricao) {
  if (!descricao) {
    return {
      categoriaId: 33,
      categoriaNome: 'Contas de Terceiro rec',
      confianca: 0.50,
      motivo: 'Sem descrição'
    };
  }

  const desc = descricao.toUpperCase();

  // REGRA 1: Aluguel
  if (desc.includes('ALUGUEL') || desc.includes('LOCAÇÃO') || desc.includes('LOCACAO')) {
    return {
      categoriaId: 32,
      categoriaNome: 'Aluguel em geral',
      confianca: 0.95,
      motivo: 'Descrição contém "aluguel/locação"'
    };
  }

  // REGRA 2: Prestação Imóvel (venda)
  const palavrasImovel = [
    'LOTE',
    'QUADRA',
    'LOTEAMENTO',
    'DOCE VIDA',
    'DOCE_VIDA',
    'CLÁUSULA',
    'CLAUSULA',
    'ETAPA',
    'FOCKER',
    'PRATA'
  ];

  // Verificar se contém alguma palavra de imóvel
  const temPalavraImovel = palavrasImovel.some(palavra => desc.includes(palavra));

  // Verificar se tem formato de parcela (XX/YY)
  const temParcela = /\d+\/\d+/.test(desc);

  if (temPalavraImovel || temParcela) {
    return {
      categoriaId: 20,
      categoriaNome: 'Prestação Imóvel',
      confianca: 0.90,
      motivo: temPalavraImovel
        ? `Descrição contém palavra-chave de imóvel`
        : 'Formato de parcela (XX/YY)'
    };
  }

  // REGRA 3: Contas de Terceiro (padrão)
  return {
    categoriaId: 33,
    categoriaNome: 'Contas de Terceiro rec',
    confianca: 0.70,
    motivo: 'Padrão (não identificado como aluguel ou venda)'
  };
}

/**
 * Atualiza classificação de uma transação
 */
async function atualizarTransacao(extrato) {
  console.log(`\n[${extrato.id}] ${extrato.descricao_original.substring(0, 60)}...`);
  console.log(`  Valor: R$ ${extrato.valor}`);

  // Já tem classificação?
  if (extrato.classificacao) {
    console.log(`  ⏭️  Já classificado: ${extrato.classificacao}`);
    return { status: 'ja_classificado' };
  }

  // Só processar CREDIT (cobranças recebidas)
  const camposExtras = extrato.campos_extras || {};
  if (camposExtras.trnType !== 'CREDIT') {
    console.log(`  ⏭️  Não é CREDIT (${camposExtras.trnType})`);
    return { status: 'nao_credit' };
  }

  // Determinar classificação
  const result = determinarClassificacao(extrato.descricao_original);

  console.log(`  💡 ${result.motivo}`);
  console.log(`  ✅ Classificação: ${result.categoriaNome} (ID ${result.categoriaId}) - ${(result.confianca * 100).toFixed(0)}%`);

  // Buscar nome da categoria no banco
  const categoria = await pool.query(`
    SELECT "id", "nome"
    FROM "bank_categorias"
    WHERE "id" = $1
  `, [result.categoriaId]);

  const categoriaNome = categoria.rows.length > 0
    ? categoria.rows[0].nome
    : result.categoriaNome;

  // Atualizar no banco
  await pool.query(`
    UPDATE bank_extratos
    SET classificacao = $1,
        classificacao_manual = false,
        confianca = $2,
        campos_extras = jsonb_set(
          jsonb_set(
            COALESCE(campos_extras, '{}'::jsonb),
            '{metodo_classificacao}',
            '"regra_descricao_ofx"'
          ),
          '{categoria_id}',
          $3::text::jsonb
        )
    WHERE id = $4
  `, [categoriaNome, result.confianca, result.categoriaId, extrato.id]);

  return {
    status: 'atualizado',
    categoriaId: result.categoriaId,
    categoriaNome
  };
}

/**
 * Processa todas as transações OFX sem classificação
 */
async function processarTodas() {
  console.log('🔍 Buscando transações OFX sem classificação...\n');

  const result = await pool.query(`
    SELECT
      id,
      descricao_original,
      valor,
      classificacao,
      campos_extras
    FROM bank_extratos
    WHERE tipo_importacao = 'MANUAL_OFX'
      AND empresa = 'IMOBEM'
      AND tipo = 'CREDITO'
    ORDER BY data, id
  `);

  console.log(`📊 Total de transações CREDIT encontradas: ${result.rows.length}\n`);

  const stats = {
    total: result.rows.length,
    atualizado: 0,
    ja_classificado: 0,
    nao_credit: 0,
    porCategoria: {}
  };

  for (const extrato of result.rows) {
    const res = await atualizarTransacao(extrato);
    stats[res.status]++;

    if (res.categoriaId) {
      stats.porCategoria[res.categoriaNome] =
        (stats.porCategoria[res.categoriaNome] || 0) + 1;
    }
  }

  // Relatório
  console.log('\n\n========================================');
  console.log('📊 RELATÓRIO DE CLASSIFICAÇÃO');
  console.log('========================================');
  console.log(`Total de cobranças CREDIT: ${stats.total}`);
  console.log(`  ✅ Atualizadas: ${stats.atualizado}`);
  console.log(`  ⏭️  Já classificadas: ${stats.ja_classificado}`);
  console.log('');

  if (Object.keys(stats.porCategoria).length > 0) {
    console.log('Classificações aplicadas:');
    Object.entries(stats.porCategoria).forEach(([nome, count]) => {
      console.log(`  ${nome}: ${count}`);
    });
  }

  console.log('========================================\n');
}

// EXECUÇÃO
console.log('🚀 Iniciando classificação final - OFX IMOBEM\n');

processarTodas()
  .then(() => {
    console.log('✅ Classificação concluída!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
