// ============================================================
// wpp/routes/banco/file-tokens-api.js — V.2609141805
// API PARA TOKENS DE ACESSO SEGURO A ARQUIVOS
// MODELO: Um token por extrato gerado (PDF)
// ============================================================

import express from 'express';
import pkg from 'pg';
import { nanoid } from 'nanoid';

const { Pool } = pkg;
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * POST /api/banco/tokens/gerar
 * Gera token para um extrato completo (PDF)
 *
 * Body:
 * - extrato_ref: Identificador do extrato (ex: "ALLMAX_2026-09", "TODAS_2026-09")
 * - descricao: Descrição do PDF gerado
 * - todos_arquivos: Objeto { lancamento_id: [{url, nome}, ...] }
 * - created_by: Quem gerou (opcional)
 *
 * Exemplo de todos_arquivos:
 * {
 *   "174": [{"url": "https://...", "nome": "recibo.jpg"}],
 *   "172": [{"url": "https://...", "nome": "doc1.pdf"}, {"url": "https://...", "nome": "doc2.jpg"}]
 * }
 */
router.post('/gerar', async (req, res) => {
  try {
    const { extrato_ref, descricao, todos_arquivos, created_by } = req.body;

    // Validações
    if (!extrato_ref || !todos_arquivos || typeof todos_arquivos !== 'object') {
      return res.status(400).json({
        erro: 'Parâmetros obrigatórios: extrato_ref, todos_arquivos (objeto)'
      });
    }

    if (Object.keys(todos_arquivos).length === 0) {
      return res.status(400).json({
        erro: 'todos_arquivos não pode ser vazio'
      });
    }

    // Verificar se já existe token para este extrato
    const tokenExistente = await pool.query(
      'SELECT token FROM file_tokens WHERE extrato_ref = $1',
      [extrato_ref]
    );

    // Se já existe, retornar o mesmo token (reutilizar)
    if (tokenExistente.rows.length > 0) {
      return res.json({
        sucesso: true,
        token: tokenExistente.rows[0].token,
        novo: false,
        mensagem: 'Token existente reutilizado',
        url: `https://calendario-boat-production.up.railway.app/visualizador/${tokenExistente.rows[0].token}`
      });
    }

    // Gerar novo token (Nanoid - 21 caracteres)
    const token = nanoid();

    // Inserir no banco
    await pool.query(
      `INSERT INTO file_tokens (token, extrato_ref, descricao, todos_arquivos, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, extrato_ref, descricao, todos_arquivos, created_by || 'API']
    );

    res.json({
      sucesso: true,
      token: token,
      novo: true,
      url: `https://calendario-boat-production.up.railway.app/visualizador/${token}`,
      total_lancamentos: Object.keys(todos_arquivos).length
    });

  } catch (err) {
    console.error('❌ Erro ao gerar token:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/tokens/info/:token
 * Retorna informações do token (sem expor URLs diretas)
 */
router.get('/info/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `SELECT token, extrato_ref, descricao, created_at, created_by,
              jsonb_object_keys(todos_arquivos) as lancamentos_ids
       FROM file_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Token não encontrado'
      });
    }

    const info = result.rows[0];

    // Contar total de arquivos
    const countResult = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM jsonb_object_keys(todos_arquivos)) as total_lancamentos,
        (SELECT SUM(jsonb_array_length(value))
         FROM jsonb_each(todos_arquivos)) as total_arquivos
       FROM file_tokens
       WHERE token = $1`,
      [token]
    );

    res.json({
      sucesso: true,
      info: {
        token: info.token,
        extrato_ref: info.extrato_ref,
        descricao: info.descricao,
        created_at: info.created_at,
        created_by: info.created_by,
        total_lancamentos: parseInt(countResult.rows[0].total_lancamentos || 0),
        total_arquivos: parseInt(countResult.rows[0].total_arquivos || 0)
      }
    });

  } catch (err) {
    console.error('❌ Erro ao buscar info do token:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/tokens/arquivos/:token/:lancamento_id
 * Retorna os arquivos de um lançamento específico
 */
router.get('/arquivos/:token/:lancamento_id', async (req, res) => {
  try {
    const { token, lancamento_id } = req.params;

    const result = await pool.query(
      `SELECT todos_arquivos->>$2 as arquivos
       FROM file_tokens
       WHERE token = $1`,
      [token, lancamento_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Token não encontrado'
      });
    }

    if (!result.rows[0].arquivos) {
      return res.status(404).json({
        erro: 'Lançamento não possui arquivos neste token'
      });
    }

    res.json({
      sucesso: true,
      lancamento_id: lancamento_id,
      arquivos: JSON.parse(result.rows[0].arquivos)
    });

  } catch (err) {
    console.error('❌ Erro ao buscar arquivos:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * DELETE /api/banco/tokens/revogar/:token
 * Revoga um token (deleta do banco)
 */
router.delete('/revogar/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      'DELETE FROM file_tokens WHERE token = $1 RETURNING *',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Token não encontrado'
      });
    }

    res.json({
      sucesso: true,
      mensagem: 'Token revogado com sucesso',
      token: token,
      extrato_ref: result.rows[0].extrato_ref
    });

  } catch (err) {
    console.error('❌ Erro ao revogar token:', err);
    res.status(500).json({ erro: err.message });
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
