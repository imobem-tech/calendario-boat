// ============================================================
// Script de Atualização de Classificação - Importação OFX
// V.260912013000
// ============================================================
//
// FUNCIONALIDADE:
// - Busca transações sem classificação (importação OFX)
// - Refaz o cruzamento com Cliente e Contas_Receber
// - Atualiza classificação automaticamente
//
// USO:
// node wpp/routes/banco/atualizar-classificacao-ofx.js
//
// ============================================================

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
 * Determina classificação baseada na cobrança
 */
function determinarClassificacaoCobranca(cobranca) {
  let classificacao = 'Receita - Outros';
  let confianca = 0.80;
  let motivo = 'Padrão';

  // REGRA 1: Se tem Nro_Venda → Venda de Imóvel
  if (cobranca.Nro_Venda) {
    classificacao = 'Receita - Venda de Imóvel';
    confianca = 0.95;
    motivo = `Nro_Venda: ${cobranca.Nro_Venda}`;
  }
  // REGRA 2: Analisar Descrição
  else if (cobranca.Descrição) {
    const desc = cobranca.Descrição.toLowerCase();

    if (desc.includes('aluguel') || desc.includes('locação') || desc.includes('locacao')) {
      classificacao = 'Receita - Aluguel';
      confianca = 0.90;
      motivo = 'Descrição contém "aluguel"';
    } else if (desc.includes('imovel') || desc.includes('imóvel') || desc.includes('venda')) {
      classificacao = 'Receita - Venda de Imóvel';
      confianca = 0.85;
      motivo = 'Descrição contém "venda/imóvel"';
    } else {
      motivo = `Descrição não identificada: "${cobranca.Descrição}"`;
    }
  }

  return { classificacao, confianca, motivo };
}

/**
 * Atualiza classificação de uma transação
 */
async function atualizarClassificacao(extrato) {
  try {
    console.log(`\n[${extrato.id}] Processando:`);
    console.log(`  Data: ${extrato.data}`);
    console.log(`  Valor: R$ ${extrato.valor}`);
    console.log(`  Descrição: ${extrato.descricao_original.substring(0, 60)}...`);

    // Se já tem classificação, pular
    if (extrato.classificacao) {
      console.log(`  ⏭️  Já classificado: ${extrato.classificacao}`);
      return { status: 'ja_classificado' };
    }

    // Extrair tipo da transação do campos_extras
    const camposExtras = extrato.campos_extras || {};
    const trnType = camposExtras.trnType;

    // FEE - Já deveria estar classificado, mas por garantia
    if (trnType === 'FEE') {
      await pool.query(`
        UPDATE bank_extratos
        SET classificacao = $1,
            classificacao_manual = false,
            confianca = 1.0
        WHERE id = $2
      `, ['Despesa Bancária - Taxas', extrato.id]);

      console.log(`  ✅ Atualizado: Despesa Bancária - Taxas`);
      return { status: 'atualizado', classificacao: 'Despesa Bancária - Taxas' };
    }

    // XFER - Transferências
    if (trnType === 'XFER') {
      if (extrato.descricao_original.toUpperCase().includes('IMOBEM')) {
        await pool.query(`
          UPDATE bank_extratos
          SET classificacao = $1,
              classificacao_manual = false,
              confianca = 0.95
          WHERE id = $2
        `, ['Transferência Interna', extrato.id]);

        console.log(`  ✅ Atualizado: Transferência Interna`);
        return { status: 'atualizado', classificacao: 'Transferência Interna' };
      } else {
        console.log(`  ⏭️  XFER externa - deixar para classificação manual`);
        return { status: 'manual' };
      }
    }

    // CREDIT - Cobranças recebidas
    if (trnType === 'CREDIT') {
      // Verificar se tem CPF
      if (!extrato.cpf_cnpj_origem) {
        console.log(`  ⚠️ Sem CPF - não pode classificar`);
        return { status: 'sem_cpf' };
      }

      // Buscar cobrança
      const cobranca = await buscarCobrancaPorCpfValor(extrato.cpf_cnpj_origem, extrato.valor);

      if (!cobranca) {
        console.log(`  ⚠️ Cobrança não encontrada para CPF ${extrato.cpf_cnpj_origem} e valor R$ ${extrato.valor}`);
        return { status: 'cobranca_nao_encontrada' };
      }

      console.log(`  ✅ Cobrança encontrada: ${cobranca.Descrição} (R$ ${cobranca.Total})`);

      // Determinar classificação
      const { classificacao, confianca, motivo } = determinarClassificacaoCobranca(cobranca);

      console.log(`  💡 ${motivo} → ${classificacao} (${(confianca * 100).toFixed(0)}%)`);

      // Atualizar campos_extras com info da cobrança
      const novosCamposExtras = {
        ...camposExtras,
        cobranca_id: cobranca.ID,
        cobranca_descricao: cobranca.Descrição,
        nro_venda: cobranca.Nro_Venda || null,
        metodo_classificacao: 'auto_cruzamento_cpf_valor_v2'
      };

      // Atualizar no banco
      await pool.query(`
        UPDATE bank_extratos
        SET classificacao = $1,
            classificacao_manual = false,
            confianca = $2,
            campos_extras = $3::jsonb
        WHERE id = $4
      `, [classificacao, confianca, JSON.stringify(novosCamposExtras), extrato.id]);

      console.log(`  ✅ Atualizado: ${classificacao}`);
      return { status: 'atualizado', classificacao };
    }

    console.log(`  ⚠️ Tipo não reconhecido: ${trnType}`);
    return { status: 'tipo_desconhecido' };

  } catch (err) {
    console.error(`  ❌ Erro ao atualizar extrato ${extrato.id}:`, err.message);
    return { status: 'erro', erro: err.message };
  }
}

/**
 * Processa todas as transações sem classificação
 */
async function processarTransacoesSemClassificacao(empresa) {
  console.log('🔍 Buscando transações sem classificação...\n');

  // Buscar todas as transações da importação OFX sem classificação
  const result = await pool.query(`
    SELECT
      id,
      data,
      valor,
      descricao_original,
      cpf_cnpj_origem,
      classificacao,
      campos_extras
    FROM bank_extratos
    WHERE tipo_importacao = 'MANUAL_OFX'
      AND empresa = $1
    ORDER BY data, id
  `, [empresa]);

  const transacoes = result.rows;
  console.log(`📊 Total de transações encontradas: ${transacoes.length}\n`);

  if (transacoes.length === 0) {
    console.log('⚠️ Nenhuma transação encontrada para atualizar');
    return;
  }

  // Estatísticas
  const stats = {
    total: transacoes.length,
    ja_classificado: 0,
    atualizado: 0,
    manual: 0,
    sem_cpf: 0,
    cobranca_nao_encontrada: 0,
    tipo_desconhecido: 0,
    erro: 0,
    porClassificacao: {}
  };

  // Processar cada transação
  for (let i = 0; i < transacoes.length; i++) {
    const transacao = transacoes[i];
    const resultado = await atualizarClassificacao(transacao);

    // Contabilizar
    stats[resultado.status]++;

    if (resultado.classificacao) {
      stats.porClassificacao[resultado.classificacao] =
        (stats.porClassificacao[resultado.classificacao] || 0) + 1;
    }
  }

  // Relatório final
  console.log('\n\n========================================');
  console.log('📊 RELATÓRIO DE ATUALIZAÇÃO');
  console.log('========================================');
  console.log(`Empresa: ${empresa}`);
  console.log('');
  console.log(`Total de transações: ${stats.total}`);
  console.log(`  ✅ Atualizadas: ${stats.atualizado}`);
  console.log(`  ⏭️  Já classificadas: ${stats.ja_classificado}`);
  console.log(`  👤 Classificação manual: ${stats.manual}`);
  console.log(`  ⚠️ Sem CPF: ${stats.sem_cpf}`);
  console.log(`  ⚠️ Cobrança não encontrada: ${stats.cobranca_nao_encontrada}`);
  console.log(`  ⚠️ Tipo desconhecido: ${stats.tipo_desconhecido}`);
  console.log(`  ❌ Erros: ${stats.erro}`);
  console.log('');

  if (Object.keys(stats.porClassificacao).length > 0) {
    console.log('Classificações aplicadas:');
    Object.entries(stats.porClassificacao).forEach(([classificacao, count]) => {
      console.log(`  ${classificacao}: ${count}`);
    });
  }

  console.log('========================================\n');
}

// ============================================================
// EXECUÇÃO
// ============================================================

const EMPRESA = 'IMOBEM';

console.log('🚀 Iniciando atualização de classificações - OFX');
console.log('');

processarTransacoesSemClassificacao(EMPRESA)
  .then(() => {
    console.log('✅ Atualização concluída!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
