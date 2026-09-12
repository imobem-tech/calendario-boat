// ============================================================
// wpp/routes/banco/recibos-api.js — V.260912081500
// API PARA ACESSAR RECIBOS SALVOS NO VERCEL BLOB
// Migrado de filesystem (Railway ephemeral) para Vercel Blob (permanente)
// ============================================================

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * GET /api/banco/recibos/listar?empresa=IMOBEM
 * Lista todos os recibos (opcionalmente filtrado por empresa)
 * Busca do banco de dados (campo recibos_urls)
 */
router.get('/listar', async (req, res) => {
  try {
    const { empresa } = req.query;

    let query = `
      SELECT
        id,
        empresa,
        data,
        valor,
        descricao_original,
        classificacao,
        recibos_urls
      FROM bank_extratos
      WHERE recibos_urls IS NOT NULL
        AND recibos_urls::TEXT != '[]'
    `;

    const params = [];

    if (empresa) {
      query += ` AND empresa = $1`;
      params.push(empresa);
    }

    query += ` ORDER BY data DESC`;

    const result = await pool.query(query, params);

    // Transformar resultado para formato esperado pela interface
    const arquivos = [];

    for (const row of result.rows) {
      const recibos = row.recibos_urls || [];

      for (const recibo of recibos) {
        // Parse do nome: 001_123456_20260912_022021.jpg
        const match = recibo.nome.match(/^(\d{3})_(\d+)_(\d{8}_\d{6})\.(.*)$/);

        if (match) {
          const [, categoriaId, lancamentoId, timestamp, ext] = match;

          arquivos.push({
            empresa: row.empresa,
            categoriaId: parseInt(categoriaId),
            lancamentoId: parseInt(lancamentoId),
            timestamp: timestamp,
            arquivo: recibo.nome,
            tamanho: recibo.tamanho || 0,
            tipo: recibo.tipo || ext,
            url: recibo.url, // URL direta do Vercel Blob
            data: row.data,
            valor: row.valor,
            descricao: row.descricao_original,
            classificacao: row.classificacao
          });
        }
      }
    }

    res.json({
      total: arquivos.length,
      arquivos: arquivos
    });

  } catch (err) {
    console.error('❌ Erro ao listar recibos:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/recibos/empresas
 * Lista empresas que têm recibos
 */
router.get('/empresas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        empresa,
        COUNT(*) FILTER (WHERE recibos_urls IS NOT NULL AND recibos_urls::TEXT != '[]') as total_recibos
      FROM bank_extratos
      WHERE recibos_urls IS NOT NULL AND recibos_urls::TEXT != '[]'
      GROUP BY empresa
      ORDER BY empresa
    `);

    const empresas = result.rows.map(row => ({
      empresa: row.empresa,
      totalRecibos: parseInt(row.total_recibos),
      url: `/api/banco/recibos/listar?empresa=${row.empresa}`
    }));

    res.json({ empresas });

  } catch (err) {
    console.error('❌ Erro ao listar empresas:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/recibos/download/:empresa/:arquivo
 * Redireciona para URL do Vercel Blob
 * (Mantido por compatibilidade, mas agora apenas redireciona)
 */
router.get('/download/:empresa/:arquivo', async (req, res) => {
  try {
    const { empresa, arquivo } = req.params;

    // Buscar URL do Vercel Blob no banco
    const result = await pool.query(`
      SELECT recibos_urls
      FROM bank_extratos
      WHERE empresa = $1
        AND recibos_urls @> $2::jsonb
    `, [empresa, JSON.stringify([{ nome: arquivo }])]);

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Arquivo não encontrado' });
    }

    const recibos = result.rows[0].recibos_urls;
    const recibo = recibos.find(r => r.nome === arquivo);

    if (!recibo) {
      return res.status(404).json({ erro: 'Arquivo não encontrado' });
    }

    // Redirecionar para URL do Vercel Blob
    res.redirect(recibo.url);

  } catch (err) {
    console.error('❌ Erro ao baixar recibo:', err);
    res.status(500).json({ erro: err.message });
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
