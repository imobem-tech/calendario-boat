// ============================================================
// reclassificar-api.js — V.2609150038
// ENDPOINT PARA RECLASSIFICAR POR PALAVRAS-CHAVE
//
// ✅ DUPLA TENTATIVA V.2609150038:
//    - 1ª tentativa: Classificar usando observacoes
//    - 2ª tentativa: Se falhar, tentar com descricao_original
//    - Resultado: Máxima taxa de classificação!
//
// + USA LÓGICA CORRETA: bank_categorias (palavras_chave + chave_aprendida)
// + NÃO USA MAIS: bank_regras_classificacao (tabela antiga)
// + Filtros: empresa (TODAS ou específica)
// + Filtros: intervalo de datas (dataInicio/dataFim)
// + Apenas não classificados (classificacao IS NULL OR = '')
// + IMPORTANTE: Atualiza APENAS classificacao (status não muda!)
// + FIX: Salva ID da categoria (não nome) para JOIN funcionar
// + IMPORTANTE: NÃO busca CR! Apenas reclassifica dados já tratados
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';
import { classificarLancamento } from './classificacao-automatica.js';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ENDPOINT POST /api/banco/reclassificar
router.post('/', async (req, res) => {
  try {
    const { empresa = 'ALLMAX', dataInicio, dataFim } = req.query;

    // Construir query dinamicamente
    let query = `
      SELECT id, empresa, descricao_original, observacoes, classificacao, status, valor, tipo, cpf_cnpj_origem
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
      semTexto: 0,             // Sem observacoes/descricao_original
      semRegra: 0,             // Tinha texto mas nenhuma regra bateu
      classificados: 0,        // Encontrou regra e classificou
      naoClassificados: 0,     // Tinha texto mas não classificou
      erros: 0
    };

    for (const reg of registros.rows) {
      try {
        stats.analisados++;

        // ✅ DUPLA TENTATIVA: Tentar com observacoes, se falhar tentar com descricao_original
        let resultado = null;

        // 1ª TENTATIVA: Se tem observacoes, tentar primeiro com elas
        if (reg.observacoes) {
          resultado = await classificarLancamento({
            description: reg.observacoes,
            value: Math.abs(reg.valor),
            tipo: reg.tipo,
            empresa: reg.empresa,
            cpfCnpjOrigem: reg.cpf_cnpj_origem
          });
        }

        // 2ª TENTATIVA: Se não classificou com observacoes, tentar com descricao_original
        if ((!resultado || !resultado.categoria_id) && reg.descricao_original) {
          resultado = await classificarLancamento({
            description: reg.descricao_original,
            value: Math.abs(reg.valor),
            tipo: reg.tipo,
            empresa: reg.empresa,
            cpfCnpjOrigem: reg.cpf_cnpj_origem
          });
        }

        // Se não tem NENHUM texto
        if (!reg.observacoes && !reg.descricao_original) {
          stats.semTexto++;
          stats.naoClassificados++;
          continue;
        }

        // Se tentou mas não conseguiu classificar
        if (!resultado || !resultado.categoria_id) {
          stats.semRegra++;
          stats.naoClassificados++;
          continue;
        }

        // Atualizar classificacao (APENAS classificacao, status não muda)
        // Salva ID da categoria (não o nome!) para o JOIN funcionar
        await pool.query(`
          UPDATE bank_extratos
          SET classificacao = $1::TEXT,
              classificado_em = NOW()
          WHERE id = $2
        `, [resultado.categoria_id, reg.id]);

        stats.classificados++;

      } catch (err) {
        console.error(`❌ Erro ao processar ID ${reg.id}:`, err);
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
