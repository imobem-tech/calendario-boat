// ============================================================
// reclassificar-api.js — V.2609142051
// ENDPOINT PARA RECLASSIFICAR POR PALAVRAS-CHAVE
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Classificar automaticamente
async function classificarAutomaticamente(texto, empresa) {
  if (!texto) return null;

  const regras = await pool.query(`
    SELECT id, nome_regra, classificacao, palavras_chave, prioridade
    FROM bank_regras_classificacao
    WHERE ativa = true
      AND ativo = true
      AND (empresa = $1 OR empresa IS NULL)
    ORDER BY prioridade DESC, id ASC
  `, [empresa]);

  const textoLower = texto.toLowerCase();

  for (const regra of regras.rows) {
    if (!regra.palavras_chave) continue;

    const palavras = regra.palavras_chave.split(',').map(p => p.trim().toLowerCase());

    if (palavras.some(palavra => textoLower.includes(palavra))) {
      return {
        classificacao: regra.classificacao,
        regra_nome: regra.nome_regra
      };
    }
  }

  return null;
}

// ENDPOINT POST /api/banco/reclassificar
router.post('/', async (req, res) => {
  try {
    const { empresa = 'ALLMAX' } = req.query;

    // Buscar registros não classificados
    const registros = await pool.query(`
      SELECT id, empresa, descricao_original, observacoes, classificacao, status
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND (classificacao IS NULL OR classificacao = '' OR status != 'OK')
      ORDER BY data, id
    `, [empresa]);

    const stats = {
      processados: 0,
      reclassificados: 0,
      semRegra: 0,
      erros: 0
    };

    for (const reg of registros.rows) {
      try {
        stats.processados++;

        const texto = reg.observacoes || reg.descricao_original;
        if (!texto) {
          stats.semRegra++;
          continue;
        }

        const resultado = await classificarAutomaticamente(texto, reg.empresa);

        if (!resultado) {
          stats.semRegra++;
          continue;
        }

        // Atualizar registro
        await pool.query(`
          UPDATE bank_extratos
          SET classificacao = $1,
              status = 'OK',
              classificado_em = NOW()
          WHERE id = $2
        `, [resultado.classificacao, reg.id]);

        stats.reclassificados++;

      } catch (err) {
        console.error(`Erro ao processar ID ${reg.id}:`, err);
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
