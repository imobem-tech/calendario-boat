// ============================================================
// wpp/routes/banco/extrato-api.js — V.2609140155
// API PARA RELATÓRIO DE EXTRATO BANCÁRIO
// Visão gerencial completa dos lançamentos
// NOVO (14/09 01:45): Adicionar saldo_acumulado (saldo total da conta)
// NOVO (14/09 01:55): ORDER BY data ASC (crescente - mais antigo primeiro)
// ============================================================

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * GET /api/banco/extrato/listar
 * Retorna extrato bancário completo com filtros
 *
 * Query params:
 * - empresa: ALLMAX, IMOBEM, IMOBAN, SUMMER (obrigatório)
 * - mes: YYYY-MM (opcional)
 * - status: OK, PENDENTE (opcional)
 * - limit: número de registros (padrão 100)
 * - offset: paginação (padrão 0)
 */
router.get('/listar', async (req, res) => {
  try {
    const { empresa, mes, status, limit = 100, offset = 0 } = req.query;

    if (!empresa) {
      return res.status(400).json({
        erro: 'Parâmetro "empresa" é obrigatório'
      });
    }

    // Montar query dinâmica
    let query = `
      SELECT
        e.id,
        e.empresa,
        e.banco,
        e.codigo_banco,
        e.nome_banco,
        e.data,
        e.mes_ref,
        e.valor,
        e.tipo,
        e.descricao_original,
        e.cpf_cnpj_origem,
        e.nome_origem,
        e.observacoes,
        e.status,
        e.classificacao,
        e.classificacao_manual,
        e.classificado_por,
        e.classificado_em,
        e.importado_em,
        e.recibos_urls,
        e.tipo_importacao,
        c.id as categoria_id,
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
      WHERE e.empresa = $1
    `;

    const params = [empresa];
    let paramIndex = 2;

    // Filtro por mês
    if (mes) {
      query += ` AND DATE_TRUNC('month', e.mes_ref) = DATE_TRUNC('month', $${paramIndex}::DATE)`;
      params.push(mes + '-01');
      paramIndex++;
    }

    // Filtro por status
    if (status) {
      query += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Ordenação e paginação (decrescente - mais recente primeiro)
    query += `
      ORDER BY e.data DESC, e.id DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Buscar totalizadores
    let queryTotais = `
      SELECT
        COUNT(*) as total_lancamentos,
        SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) as total_creditos,
        SUM(CASE WHEN valor < 0 THEN ABS(valor) ELSE 0 END) as total_debitos,
        SUM(valor) as saldo
      FROM bank_extratos
      WHERE empresa = $1
    `;

    const paramsTotais = [empresa];
    let paramIndexTotais = 2;

    if (mes) {
      queryTotais += ` AND DATE_TRUNC('month', mes_ref) = DATE_TRUNC('month', $${paramIndexTotais}::DATE)`;
      paramsTotais.push(mes + '-01');
      paramIndexTotais++;
    }

    if (status) {
      queryTotais += ` AND status = $${paramIndexTotais}`;
      paramsTotais.push(status);
    }

    const totaisResult = await pool.query(queryTotais, paramsTotais);
    const totais = totaisResult.rows[0];

    // Buscar saldo acumulado total (sem filtros de período)
    const saldoAcumuladoResult = await pool.query(`
      SELECT SUM(valor) as saldo_acumulado
      FROM bank_extratos
      WHERE empresa = $1
    `, [empresa]);
    const saldoAcumulado = parseFloat(saldoAcumuladoResult.rows[0].saldo_acumulado || 0);

    // Formatar lançamentos
    const lancamentos = result.rows.map(row => ({
      id: row.id,
      empresa: row.empresa,
      banco: row.banco,
      codigo_banco: row.codigo_banco,
      nome_banco: row.nome_banco,
      data: row.data,
      mes_ref: row.mes_ref,
      valor: parseFloat(row.valor),
      tipo: row.tipo,
      descricao: row.descricao_original,
      origem: {
        cpf_cnpj: row.cpf_cnpj_origem,
        nome: row.nome_origem
      },
      categoria: row.categoria_id ? {
        id: row.categoria_id,
        nome: row.categoria_nome,
        icone: row.categoria_icone,
        cor: row.categoria_cor
      } : null,
      observacoes: row.observacoes,
      status: row.status,
      classificacao_manual: row.classificacao_manual,
      classificado_por: row.classificado_por,
      classificado_em: row.classificado_em,
      importado_em: row.importado_em,
      tipo_importacao: row.tipo_importacao,
      tem_anexo: row.recibos_urls && row.recibos_urls.length > 0,
      anexos: row.recibos_urls || []
    }));

    res.json({
      sucesso: true,
      empresa: empresa,
      mes: mes || 'todos',
      status: status || 'todos',
      totais: {
        lancamentos: parseInt(totais.total_lancamentos),
        creditos: parseFloat(totais.total_creditos || 0),
        debitos: parseFloat(totais.total_debitos || 0),
        saldo: parseFloat(totais.saldo || 0),
        saldo_acumulado: saldoAcumulado
      },
      paginacao: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      },
      lancamentos: lancamentos
    });

  } catch (err) {
    console.error('❌ Erro ao buscar extrato:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/extrato/meses
 * Lista meses disponíveis para uma empresa
 */
router.get('/meses', async (req, res) => {
  try {
    const { empresa } = req.query;

    if (!empresa) {
      return res.status(400).json({
        erro: 'Parâmetro "empresa" é obrigatório'
      });
    }

    const result = await pool.query(`
      SELECT DISTINCT
        DATE_TRUNC('month', mes_ref) as mes,
        TO_CHAR(mes_ref, 'MM/YYYY') as mes_formatado,
        COUNT(*) as total_lancamentos
      FROM bank_extratos
      WHERE empresa = $1
        AND mes_ref IS NOT NULL
      GROUP BY DATE_TRUNC('month', mes_ref), TO_CHAR(mes_ref, 'MM/YYYY')
      ORDER BY mes DESC
    `, [empresa]);

    const meses = result.rows.map(row => ({
      mes: row.mes,
      mes_formatado: row.mes_formatado,
      total_lancamentos: parseInt(row.total_lancamentos)
    }));

    res.json({
      sucesso: true,
      empresa: empresa,
      meses: meses
    });

  } catch (err) {
    console.error('❌ Erro ao listar meses:', err);
    res.status(500).json({ erro: err.message });
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
