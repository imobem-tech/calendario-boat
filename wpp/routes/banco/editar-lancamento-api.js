// ============================================================
// wpp/routes/banco/editar-lancamento-api.js — V.2609150035
// API PARA EDITAR LANÇAMENTOS BANCÁRIOS
//
// ✅ V.2609150035: Ordenação + STATUS
//    - GET /categorias: ORDER BY ordem DESC (maior valor primeiro)
//    - PUT /lancamento: Aceita status (PENDENTE/OK) explícito
//
// HISTÓRICO:
// + V.2609142140: Usa bank_categorias, classificacao, JOIN correto
// ============================================================

import express from 'express';
import pkg from 'pg';

const { Pool } = pkg;
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * GET /api/banco/categorias
 * Retorna todas as categorias disponíveis
 */
router.get('/categorias', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        nome,
        icone,
        cor,
        tipo,
        empresa,
        ordem
      FROM bank_categorias
      WHERE ativo = true
      ORDER BY ordem DESC NULLS LAST, nome
    `);

    res.json({
      sucesso: true,
      categorias: result.rows
    });

  } catch (err) {
    console.error('❌ Erro ao buscar categorias:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * PUT /api/banco/lancamento/:id
 * Atualiza um lançamento bancário
 *
 * Body:
 * - categoria_id: number (opcional)
 * - descricao: string (opcional)
 * - observacoes: string (opcional)
 * - status: string (opcional - PENDENTE/OK)
 */
router.put('/lancamento/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { categoria_id, descricao, observacoes, status } = req.body;

    console.log(`📝 Atualizando lançamento ${id}:`, { categoria_id, descricao, observacoes, status });

    // Montar query dinâmica baseado nos campos fornecidos
    const campos = [];
    const valores = [];
    let contador = 1;

    if (categoria_id !== undefined) {
      // Campo classificacao armazena ID da categoria como TEXT
      campos.push(`classificacao = $${contador}::TEXT`);
      valores.push(categoria_id);
      contador++;
    }

    if (descricao !== undefined) {
      campos.push(`descricao = $${contador}`);
      valores.push(descricao);
      contador++;
    }

    if (observacoes !== undefined) {
      campos.push(`observacoes = $${contador}`);
      valores.push(observacoes);
      contador++;
    }

    // ✅ NOVO: Aceitar status explícito (PENDENTE/OK)
    if (status !== undefined) {
      campos.push(`status = $${contador}`);
      valores.push(status);
      contador++;
    } else if (categoria_id !== undefined && categoria_id !== null) {
      // Se categoria foi definida mas status não, marcar como OK automaticamente
      campos.push(`status = 'OK'`);
    }

    if (campos.length === 0) {
      return res.status(400).json({
        erro: 'Nenhum campo para atualizar'
      });
    }

    // Adicionar ID no final
    valores.push(id);

    const query = `
      UPDATE bank_extratos
      SET ${campos.join(', ')}
      WHERE id = $${contador}
      RETURNING *
    `;

    console.log('📊 Query:', query);
    console.log('📊 Valores:', valores);

    const result = await pool.query(query, valores);

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Lançamento não encontrado'
      });
    }

    console.log(`✅ Lançamento ${id} atualizado com sucesso`);

    res.json({
      sucesso: true,
      lancamento: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Erro ao atualizar lançamento:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/lancamento/:id
 * Retorna um lançamento específico
 */
router.get('/lancamento/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        e.*,
        c.nome as categoria_nome,
        c.icone as categoria_icone,
        c.cor as categoria_cor
      FROM bank_extratos e
      LEFT JOIN bank_categorias c ON (
        CASE
          WHEN e.classificacao ~ '^[0-9]+$' THEN e.classificacao::INTEGER
          ELSE NULL
        END = c.id
      )
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Lançamento não encontrado'
      });
    }

    res.json({
      sucesso: true,
      lancamento: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Erro ao buscar lançamento:', err);
    res.status(500).json({ erro: err.message });
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
