// ============================================================
// DEBUG: Verificar recibos no banco
// TEMPORÁRIO - Remover depois do diagnóstico
// ============================================================

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * GET /api/banco/debug/recibos
 * Mostra TODOS os recibos (recibos_urls + campos_extras)
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        empresa,
        data,
        valor,
        LEFT(descricao_original, 50) as descricao,
        recibos_urls,
        campos_extras->'dados_recibo'->>'documento' as doc_local,
        campos_extras->'dados_recibo'->>'fornecedor' as fornecedor,
        importado_em,
        classificado_em
      FROM bank_extratos
      WHERE (
        recibos_urls IS NOT NULL
        OR campos_extras->'dados_recibo' IS NOT NULL
      )
      ORDER BY COALESCE(classificado_em, importado_em) DESC
      LIMIT 20
    `);

    const hoje = new Date().toISOString().split('T')[0];
    const recibosHoje = result.rows.filter(r => {
      const dataRow = r.classificado_em || r.importado_em;
      return dataRow && dataRow.toISOString().split('T')[0] === hoje;
    });

    const comUrl = result.rows.filter(r => r.recibos_urls && r.recibos_urls.length > 0);
    const somenteLocal = result.rows.filter(r => !r.recibos_urls && r.doc_local);

    res.json({
      total: result.rows.length,
      hoje: recibosHoje.length,
      comVercelBlob: comUrl.length,
      apenasLocal: somenteLocal.length,
      recibos: result.rows.map(r => ({
        id: r.id,
        empresa: r.empresa,
        data: r.data,
        valor: r.valor,
        descricao: r.descricao,
        fornecedor: r.fornecedor,
        tipo: r.recibos_urls ? 'VERCEL_BLOB' : 'LOCAL',
        arquivos: r.recibos_urls || (r.doc_local ? [r.doc_local] : []),
        timestamp: r.classificado_em || r.importado_em
      }))
    });

  } catch (err) {
    console.error('❌ Erro debug:', err);
    res.status(500).json({ erro: err.message });
  }
});

export default router;
