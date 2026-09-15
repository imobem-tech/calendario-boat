// ============================================================
// reclassificar-api.js — V.2609142150
// ENDPOINT PARA RECLASSIFICAR POR PALAVRAS-CHAVE
// + USA LÓGICA CORRETA: bank_categorias (palavras_chave + chave_aprendida)
// + NÃO USA MAIS: bank_regras_classificacao (tabela antiga)
// + Filtros: empresa (TODAS ou específica)
// + Filtros: intervalo de datas (dataInicio/dataFim)
// + Apenas não classificados (classificacao IS NULL OR = '')
// + IMPORTANTE: Atualiza APENAS classificacao (status não muda!)
// + FIX: Salva ID da categoria (não nome) para JOIN funcionar
// + NOVO: Busca CR para preencher observacoes antes de classificar
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';
import { classificarLancamento } from './classificacao-automatica.js';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Buscar CR (Conta a Receber) por CPF/valor/data
// Tolerâncias: Data ±10 dias, Valor ±5% (campo Total)
async function buscarCR(cpfCnpj, dataExtrato, valorExtrato, empresa) {
  try {
    if (!cpfCnpj) return null;

    const codigoEmpresa = empresa === 'ALLMAX' ? 1 : empresa === 'IMOBEM' ? 2 : empresa === 'SUMMER' ? 3 : null;
    if (!codigoEmpresa) return null;

    const valorNum = Math.abs(parseFloat(valorExtrato));
    const dataStr = dataExtrato instanceof Date
      ? dataExtrato.toISOString().split('T')[0]
      : dataExtrato.toString().split('T')[0];

    // Buscar cliente pelo CPF
    const cliente = await pool.query(`
      SELECT "Codigo", "Cliente_Nome", "Cliente_CPF"
      FROM "Cliente"
      WHERE "Cliente_CPF" = $1
        AND "Empresa" = $2
      LIMIT 1
    `, [cpfCnpj, codigoEmpresa]);

    if (cliente.rows.length === 0) return null;

    const codigoCliente = cliente.rows[0].Codigo;

    // Buscar CR (tolerância: ±10 dias, ±5% valor)
    const result = await pool.query(`
      SELECT "Codigo", "Código_Cliente", "Data_Vencimento", "Total", "Descricao"
      FROM "Contas_Receber"
      WHERE "Código_Cliente" = $1
        AND "Empresa" = $2
      ORDER BY "Data_Vencimento"
    `, [codigoCliente, codigoEmpresa]);

    for (const cr of result.rows) {
      const dataVenc = new Date(cr.Data_Vencimento);
      const dataExt = new Date(dataStr);
      const difDias = Math.abs((dataVenc - dataExt) / (1000 * 60 * 60 * 24));
      const valorCR = parseFloat(cr.Total);
      const difValorPercent = Math.abs((valorCR - valorNum) / valorCR);

      // Tolerância: ±10 dias E ±5% do valor
      if (difDias <= 10 && difValorPercent <= 0.05) {
        return {
          codigo: cr.Codigo,
          descricao: cr.Descricao,
          valor: cr.Total
        };
      }
    }

    return null;
  } catch (err) {
    console.error(`❌ Erro ao buscar CR:`, err.message);
    return null;
  }
}

// ENDPOINT POST /api/banco/reclassificar
router.post('/', async (req, res) => {
  try {
    const { empresa = 'ALLMAX', dataInicio, dataFim } = req.query;

    // Construir query dinamicamente (incluir data para buscar CR)
    let query = `
      SELECT id, empresa, data, descricao_original, observacoes, classificacao, status, valor, tipo, cpf_cnpj_origem
      FROM bank_extratos
      WHERE banco = 'Asaas'
        AND (classificacao IS NULL OR classificacao = '')
    `;

    const params = [];
    let paramIndex = 1;

    // Filtro de empresa
    if (empresa && empresa !== 'TODAS') {
      query += ` AND empresa = $${paramIndex}`;
      params.push(empresa);
      paramIndex++;
    }

    // Filtro de data
    if (dataInicio && dataFim) {
      query += ` AND data BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dataInicio, dataFim);
      paramIndex += 2;
    }

    query += ` ORDER BY data, id`;

    // Buscar registros não classificados
    const registros = await pool.query(query, params);

    const stats = {
      analisados: 0,           // Total de registros tentados
      crEncontradas: 0,        // CRs encontradas e vinculadas
      semTexto: 0,             // Sem observacoes/descricao_original
      semRegra: 0,             // Tinha texto mas nenhuma regra bateu
      classificados: 0,        // Encontrou regra e classificou
      naoClassificados: 0,     // Tinha texto mas não classificou
      erros: 0
    };

    for (const reg of registros.rows) {
      try {
        stats.analisados++;

        // 1. Se NÃO tem observacoes, buscar CR
        let observacoes = reg.observacoes;

        if (!observacoes && reg.cpf_cnpj_origem && reg.tipo === 'CREDITO') {
          console.log(`🔍 ID ${reg.id}: Buscando CR (CPF: ${reg.cpf_cnpj_origem}, Valor: R$ ${reg.valor})...`);

          const cr = await buscarCR(
            reg.cpf_cnpj_origem,
            reg.data,
            reg.valor,
            reg.empresa
          );

          if (cr && cr.descricao) {
            observacoes = cr.descricao;

            // Atualizar observacoes no banco
            await pool.query(`
              UPDATE bank_extratos
              SET observacoes = $1
              WHERE id = $2
            `, [observacoes, reg.id]);

            stats.crEncontradas++;
            console.log(`✅ ID ${reg.id}: CR ${cr.codigo} encontrada! Observação: "${observacoes}"`);
          }
        }

        // 2. Classificar usando observacoes (se tiver) ou descrição_original
        const descricao = observacoes || reg.descricao_original;
        if (!descricao) {
          stats.semTexto++;
          stats.naoClassificados++;
          continue;
        }

        // Usar a função correta de classificação!
        const resultado = await classificarLancamento({
          description: descricao,
          value: Math.abs(reg.valor), // Valor absoluto
          tipo: reg.tipo,
          empresa: reg.empresa,
          cpfCnpjOrigem: reg.cpf_cnpj_origem
        });

        if (!resultado || !resultado.categoria_id) {
          stats.semRegra++;
          stats.naoClassificados++;
          continue;
        }

        // 3. Atualizar classificacao (APENAS classificacao, status não muda)
        // Salva ID da categoria (não o nome!) para o JOIN funcionar
        await pool.query(`
          UPDATE bank_extratos
          SET classificacao = $1::TEXT,
              classificado_em = NOW()
          WHERE id = $2
        `, [resultado.categoria_id, reg.id]);

        stats.classificados++;
        console.log(`✅ ID ${reg.id}: Classificado como "${resultado.categoria_nome}"`);

      } catch (err) {
        console.error(`❌ Erro ao processar ID ${reg.id}:`, err.message);
        stats.erros++;
      }
    }

    res.json({ sucesso: true, stats });

  } catch (err) {
    console.error('Erro ao reclassificar:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
