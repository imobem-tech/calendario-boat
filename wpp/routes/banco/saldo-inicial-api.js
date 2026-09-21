// ============================================================
// saldo-inicial-api.js — V.2609211402
// API para gerenciar saldos iniciais
//
// ENDPOINTS:
// - POST /api/banco/saldo-inicial         → Salvar/atualizar saldo
// - GET  /api/banco/saldo-inicial         → Listar histórico
// - GET  /api/banco/saldo-inicial/atual   → Buscar saldo vigente
// - GET  /api/banco/saldo-inicial/periodo → Buscar saldos dentro de período
// - DELETE /api/banco/saldo-inicial/:id   → Excluir ajuste
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// POST /api/banco/saldo-inicial
// Salvar ou atualizar saldo inicial
// ============================================================
router.post('/', async (req, res) => {
  try {
    const { empresa, banco, data_referencia, saldo_informado, observacao, usuario } = req.body;

    // Validações
    if (!empresa || !banco || !data_referencia || saldo_informado === undefined) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Campos obrigatórios: empresa, banco, data_referencia, saldo_informado'
      });
    }

    // Verificar se já existe para essa data
    const existe = await pool.query(`
      SELECT id FROM bank_saldos_iniciais
      WHERE empresa = $1 AND banco = $2 AND data_referencia = $3
    `, [empresa, banco, data_referencia]);

    let resultado;

    if (existe.rows.length > 0) {
      // UPDATE
      resultado = await pool.query(`
        UPDATE bank_saldos_iniciais
        SET saldo_informado = $1,
            observacao = $2,
            usuario = $3,
            criado_em = NOW()
        WHERE id = $4
        RETURNING *
      `, [saldo_informado, observacao, usuario, existe.rows[0].id]);

      console.log(`✅ Saldo inicial ATUALIZADO: ${empresa}/${banco} em ${data_referencia}`);
    } else {
      // INSERT
      resultado = await pool.query(`
        INSERT INTO bank_saldos_iniciais (empresa, banco, data_referencia, saldo_informado, observacao, usuario)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [empresa, banco, data_referencia, saldo_informado, observacao, usuario]);

      console.log(`✅ Saldo inicial CRIADO: ${empresa}/${banco} em ${data_referencia}`);
    }

    res.json({
      sucesso: true,
      saldo: resultado.rows[0]
    });

  } catch (err) {
    console.error('❌ Erro ao salvar saldo inicial:', err);
    res.status(500).json({
      sucesso: false,
      erro: err.message
    });
  }
});

// ============================================================
// GET /api/banco/saldo-inicial
// Listar histórico de saldos
// Query params: empresa, banco
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { empresa, banco } = req.query;

    let query = 'SELECT * FROM bank_saldos_iniciais WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (empresa) {
      query += ` AND empresa = $${paramIndex}`;
      params.push(empresa);
      paramIndex++;
    }

    if (banco) {
      query += ` AND banco = $${paramIndex}`;
      params.push(banco);
      paramIndex++;
    }

    query += ' ORDER BY data_referencia DESC, criado_em DESC';

    const result = await pool.query(query, params);

    res.json({
      sucesso: true,
      saldos: result.rows
    });

  } catch (err) {
    console.error('❌ Erro ao listar saldos:', err);
    res.status(500).json({
      sucesso: false,
      erro: err.message
    });
  }
});

// ============================================================
// GET /api/banco/saldo-inicial/atual
// Buscar saldo vigente para uma data
// Query params: empresa, banco, data (opcional, default = hoje)
// ============================================================
router.get('/atual', async (req, res) => {
  try {
    const { empresa, banco, data } = req.query;

    if (!empresa || !banco) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Parâmetros obrigatórios: empresa, banco'
      });
    }

    const dataReferencia = data || new Date().toISOString().split('T')[0];

    // Buscar saldo mais recente <= data informada
    const result = await pool.query(`
      SELECT *
      FROM bank_saldos_iniciais
      WHERE empresa = $1
        AND banco = $2
        AND data_referencia <= $3
      ORDER BY data_referencia DESC
      LIMIT 1
    `, [empresa, banco, dataReferencia]);

    if (result.rows.length === 0) {
      return res.json({
        sucesso: true,
        saldo: null,
        mensagem: 'Nenhum saldo inicial cadastrado para esta empresa/banco'
      });
    }

    res.json({
      sucesso: true,
      saldo: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Erro ao buscar saldo atual:', err);
    res.status(500).json({
      sucesso: false,
      erro: err.message
    });
  }
});

// ============================================================
// GET /api/banco/saldo-inicial/periodo
// Buscar TODOS os saldos dentro de um período
// Query params: empresa, banco, data_inicio, data_fim
// ============================================================
router.get('/periodo', async (req, res) => {
  try {
    const { empresa, banco, data_inicio, data_fim } = req.query;

    if (!empresa || !banco || !data_inicio || !data_fim) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Parâmetros obrigatórios: empresa, banco, data_inicio, data_fim'
      });
    }

    // Buscar TODOS os saldos dentro do período (inclusive nas bordas)
    const result = await pool.query(`
      SELECT *
      FROM bank_saldos_iniciais
      WHERE empresa = $1
        AND banco = $2
        AND data_referencia >= $3
        AND data_referencia <= $4
      ORDER BY data_referencia ASC
    `, [empresa, banco, data_inicio, data_fim]);

    res.json({
      sucesso: true,
      saldos: result.rows
    });

  } catch (err) {
    console.error('❌ Erro ao buscar saldos do período:', err);
    res.status(500).json({
      sucesso: false,
      erro: err.message
    });
  }
});

// ============================================================
// DELETE /api/banco/saldo-inicial/:id
// Excluir um ajuste de saldo
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM bank_saldos_iniciais
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Saldo não encontrado'
      });
    }

    console.log(`🗑️ Saldo inicial EXCLUÍDO: ID ${id}`);

    res.json({
      sucesso: true,
      saldo: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Erro ao excluir saldo:', err);
    res.status(500).json({
      sucesso: false,
      erro: err.message
    });
  }
});

export default router;
