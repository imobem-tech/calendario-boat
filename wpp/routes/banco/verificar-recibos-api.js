// ============================================================
// verificar-recibos-api.js — V.2610011240
// AUDITORIA DE RECIBOS/ANEXOS
//
// ✅ FUNCIONALIDADES:
//    - Verifica registros com recibos_urls preenchido
//    - Detecta possíveis perdas de anexos
//    - Relatório de anexos por período
//    - Estatísticas de recibos
//
// ROTAS:
//    GET /api/banco/recibos/verificar?empresa=ALLMAX
//    GET /api/banco/recibos/estatisticas?empresa=ALLMAX
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// GET /api/banco/recibos/verificar
// Verifica integridade dos recibos
// ============================================================
router.get('/verificar', async (req, res) => {
  try {
    const { empresa = 'ALLMAX', dataInicio, dataFim } = req.query;

    // Buscar registros com recibos
    let query = `
      SELECT
        id,
        data,
        descricao_original,
        valor,
        tipo,
        recibos_urls,
        jsonb_array_length(recibos_urls) as qtd_recibos,
        status,
        classificacao,
        importado_em,
        tipo_importacao
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND recibos_urls IS NOT NULL
        AND jsonb_array_length(recibos_urls) > 0
    `;

    const params = [empresa];
    let paramIndex = 2;

    if (dataInicio && dataFim) {
      query += ` AND data BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dataInicio, dataFim);
      paramIndex += 2;
    }

    query += ` ORDER BY data DESC`;

    const result = await pool.query(query, params);

    // Estatísticas
    const stats = {
      total_com_recibos: result.rows.length,
      total_recibos: result.rows.reduce((sum, r) => sum + r.qtd_recibos, 0),
      por_tipo: {},
      por_status: {},
      por_mes: {}
    };

    result.rows.forEach(r => {
      // Por tipo
      stats.por_tipo[r.tipo] = (stats.por_tipo[r.tipo] || 0) + 1;

      // Por status
      const status = r.status || 'SEM_STATUS';
      stats.por_status[status] = (stats.por_status[status] || 0) + 1;

      // Por mês
      const mes = r.data.toISOString().substring(0, 7);
      stats.por_mes[mes] = (stats.por_mes[mes] || 0) + 1;
    });

    res.json({
      sucesso: true,
      stats,
      registros: result.rows.map(r => ({
        id: r.id,
        data: r.data,
        descricao: r.descricao_original,
        valor: parseFloat(r.valor),
        tipo: r.tipo,
        qtd_recibos: r.qtd_recibos,
        recibos: r.recibos_urls,
        status: r.status,
        classificacao: r.classificacao,
        importado_em: r.importado_em,
        tipo_importacao: r.tipo_importacao
      }))
    });

  } catch (err) {
    console.error('❌ Erro ao verificar recibos:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// GET /api/banco/recibos/estatisticas
// Estatísticas gerais de recibos
// ============================================================
router.get('/estatisticas', async (req, res) => {
  try {
    const { empresa = 'ALLMAX' } = req.query;

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_registros,
        COUNT(CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN 1 END) as com_recibos,
        COUNT(CASE WHEN recibos_urls IS NULL OR jsonb_array_length(recibos_urls) = 0 THEN 1 END) as sem_recibos,
        SUM(CASE WHEN recibos_urls IS NOT NULL THEN jsonb_array_length(recibos_urls) ELSE 0 END) as total_recibos,
        MIN(CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN data END) as primeiro_recibo,
        MAX(CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN data END) as ultimo_recibo
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
    `, [empresa]);

    const porMes = await pool.query(`
      SELECT
        TO_CHAR(data, 'YYYY-MM') as mes,
        COUNT(*) as total_registros,
        COUNT(CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN 1 END) as com_recibos,
        SUM(CASE WHEN recibos_urls IS NOT NULL THEN jsonb_array_length(recibos_urls) ELSE 0 END) as total_recibos
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND data >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY TO_CHAR(data, 'YYYY-MM')
      ORDER BY mes DESC
    `, [empresa]);

    res.json({
      sucesso: true,
      geral: stats.rows[0],
      por_mes: porMes.rows,
      percentual_com_recibos: stats.rows[0].total_registros > 0
        ? ((stats.rows[0].com_recibos / stats.rows[0].total_registros) * 100).toFixed(2) + '%'
        : '0%'
    });

  } catch (err) {
    console.error('❌ Erro ao buscar estatísticas:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// GET /api/banco/recibos/possiveis-perdas
// Detecta possíveis registros que perderam recibos
// ============================================================
router.get('/possiveis-perdas', async (req, res) => {
  try {
    const { empresa = 'ALLMAX' } = req.query;

    // Buscar registros que foram importados/atualizados recentemente
    // mas não têm recibos (possível perda)
    const result = await pool.query(`
      SELECT
        id,
        data,
        descricao_original,
        valor,
        tipo,
        status,
        classificacao,
        importado_em,
        tipo_importacao,
        recibos_urls
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND tipo = 'CREDITO'
        AND valor > 100
        AND (recibos_urls IS NULL OR jsonb_array_length(recibos_urls) = 0)
        AND importado_em >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY data DESC
      LIMIT 100
    `, [empresa]);

    res.json({
      sucesso: true,
      total: result.rows.length,
      mensagem: result.rows.length > 0
        ? 'Registros que PODEM ter perdido recibos (CRÉDITOS > R$100 sem anexos)'
        : 'Nenhuma perda detectada',
      registros: result.rows.map(r => ({
        id: r.id,
        data: r.data,
        descricao: r.descricao_original,
        valor: parseFloat(r.valor),
        status: r.status,
        importado_em: r.importado_em,
        tipo_importacao: r.tipo_importacao
      }))
    });

  } catch (err) {
    console.error('❌ Erro ao detectar perdas:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
