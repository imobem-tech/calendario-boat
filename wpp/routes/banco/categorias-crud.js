// ============================================================
// wpp/routes/banco/categorias-crud.js — V.260912010000
// CRUD DE CATEGORIAS BANCÁRIAS
// Gerenciamento fácil via HTTP (API REST)
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * GET /api/banco/categorias?empresa=ALLMAX
 * Lista categorias de uma empresa
 */
export async function listarCategorias(req, res) {
  try {
    const { empresa } = req.query;

    if (!empresa) {
      return res.status(400).json({
        erro: 'Parâmetro empresa é obrigatório',
        exemplo: '/api/banco/categorias?empresa=ALLMAX'
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        empresa,
        nome,
        tipo,
        cor,
        icone,
        ordem,
        ativo,
        vezes_usada,
        (ordem - (COALESCE(vezes_usada, 0)::float / 10)) as ordem_dinamica
      FROM bank_categorias
      WHERE empresa = $1
      ORDER BY ordem_dinamica, nome
    `, [empresa]);

    res.json({
      empresa,
      total: result.rows.length,
      categorias: result.rows
    });

  } catch (err) {
    console.error('❌ Erro ao listar categorias:', err);
    res.status(500).json({ erro: err.message });
  }
}

/**
 * GET /api/banco/categorias/:id
 * Busca uma categoria específica
 */
export async function buscarCategoria(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT * FROM bank_categorias WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('❌ Erro ao buscar categoria:', err);
    res.status(500).json({ erro: err.message });
  }
}

/**
 * POST /api/banco/categorias
 * Cria nova categoria
 * Body: { empresa, nome, tipo, cor, icone, ordem }
 */
export async function criarCategoria(req, res) {
  try {
    const { empresa, nome, tipo, cor, icone, ordem } = req.body;

    // Validações
    if (!empresa || !nome || !tipo) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: empresa, nome, tipo',
        recebido: req.body
      });
    }

    const empresasValidas = ['ALLMAX', 'IMOBEM', 'IMOBAN', 'SUMMER'];
    if (!empresasValidas.includes(empresa)) {
      return res.status(400).json({
        erro: 'Empresa inválida',
        empresa_recebida: empresa,
        empresas_validas: empresasValidas
      });
    }

    const tiposValidos = ['RECEITA', 'DESPESA', 'TRANSFERENCIA'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({
        erro: 'Tipo inválido',
        tipo_recebido: tipo,
        tipos_validos: tiposValidos
      });
    }

    // Inserir
    const result = await pool.query(`
      INSERT INTO bank_categorias
        (empresa, nome, tipo, cor, icone, ordem, ativo)
      VALUES
        ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
    `, [empresa, nome, tipo, cor || '#6b7280', icone || '📌', ordem || 999]);

    res.status(201).json({
      mensagem: 'Categoria criada com sucesso',
      categoria: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Erro ao criar categoria:', err);

    // Erro de constraint único
    if (err.code === '23505') {
      return res.status(400).json({
        erro: 'Categoria já existe para esta empresa',
        detalhes: err.detail
      });
    }

    res.status(500).json({ erro: err.message });
  }
}

/**
 * PUT /api/banco/categorias/:id
 * Atualiza categoria existente
 * Body: { nome, tipo, cor, icone, ordem, ativo }
 */
export async function atualizarCategoria(req, res) {
  try {
    const { id } = req.params;
    const { nome, tipo, cor, icone, ordem, ativo } = req.body;

    // Verificar se existe
    const existe = await pool.query('SELECT id FROM bank_categorias WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada' });
    }

    // Montar query dinâmica
    const campos = [];
    const valores = [];
    let paramIndex = 1;

    if (nome !== undefined) {
      campos.push(`nome = $${paramIndex++}`);
      valores.push(nome);
    }
    if (tipo !== undefined) {
      campos.push(`tipo = $${paramIndex++}`);
      valores.push(tipo);
    }
    if (cor !== undefined) {
      campos.push(`cor = $${paramIndex++}`);
      valores.push(cor);
    }
    if (icone !== undefined) {
      campos.push(`icone = $${paramIndex++}`);
      valores.push(icone);
    }
    if (ordem !== undefined) {
      campos.push(`ordem = $${paramIndex++}`);
      valores.push(ordem);
    }
    if (ativo !== undefined) {
      campos.push(`ativo = $${paramIndex++}`);
      valores.push(ativo);
    }

    if (campos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
    }

    valores.push(id);

    const result = await pool.query(`
      UPDATE bank_categorias
      SET ${campos.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, valores);

    res.json({
      mensagem: 'Categoria atualizada com sucesso',
      categoria: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Erro ao atualizar categoria:', err);
    res.status(500).json({ erro: err.message });
  }
}

/**
 * DELETE /api/banco/categorias/:id
 * Remove categoria (soft delete - marca como inativa)
 */
export async function deletarCategoria(req, res) {
  try {
    const { id } = req.params;
    const { permanent } = req.query; // ?permanent=true para deletar de verdade

    if (permanent === 'true') {
      // Delete permanente
      const result = await pool.query(`
        DELETE FROM bank_categorias
        WHERE id = $1
        RETURNING *
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ erro: 'Categoria não encontrada' });
      }

      res.json({
        mensagem: 'Categoria deletada PERMANENTEMENTE',
        categoria: result.rows[0]
      });

    } else {
      // Soft delete (marca como inativa)
      const result = await pool.query(`
        UPDATE bank_categorias
        SET ativo = false
        WHERE id = $1
        RETURNING *
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ erro: 'Categoria não encontrada' });
      }

      res.json({
        mensagem: 'Categoria desativada (soft delete)',
        categoria: result.rows[0],
        dica: 'Use ?permanent=true para deletar permanentemente'
      });
    }

  } catch (err) {
    console.error('❌ Erro ao deletar categoria:', err);
    res.status(500).json({ erro: err.message });
  }
}

// ============================================================
// FIM
// ============================================================
