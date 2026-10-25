// ============================================================
// api/orcamentos/visualizar/[token]/anexos.js — V.2610242101
// GET /api/orcamentos/visualizar/:token/anexos
// Lista anexos VISÍVEIS do orçamento
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  // Só aceita GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Método não permitido'
    });
  }

  try {
    const { token } = req.query;

    console.log(`📎 Listando anexos visíveis do token: ${token}`);

    // 1. Buscar ID do orçamento pelo token
    const orcResult = await pool.query(`
      SELECT id_orcamento
      FROM orcamento_servico
      WHERE token_visualizacao = $1
    `, [token]);

    if (orcResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orçamento não encontrado'
      });
    }

    const idOrcamento = orcResult.rows[0].id_orcamento;

    // 2. Buscar anexos visíveis
    const anexosResult = await pool.query(`
      SELECT
        nome_amigavel,
        tipo_arquivo,
        url,
        tamanho_bytes,
        data_upload
      FROM orcamento_anexo
      WHERE id_orcamento = $1
        AND visivel_cliente = true
      ORDER BY data_upload DESC
    `, [idOrcamento]);

    res.status(200).json({
      success: true,
      total: anexosResult.rows.length,
      anexos: anexosResult.rows
    });

  } catch (error) {
    console.error('❌ Erro ao listar anexos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar anexos',
      message: error.message
    });
  }
}

// ============================================================
// FIM — V.2610242101
// ============================================================
