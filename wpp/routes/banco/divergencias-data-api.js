// ============================================================
// divergencias-data-api.js — V.2610011210
// ENDPOINT PARA DETECTAR E RESOLVER DIVERGÊNCIAS DE DATA
//
// ✅ FUNCIONALIDADES:
//    - Detecta lançamentos com data diferente mas mesmo valor/descrição
//    - Apresenta relatório ao operador
//    - Permite escolher qual data assumir
//    - Atualiza registro com histórico da correção
//
// ROTAS:
//    GET  /api/banco/divergencias-data?empresa=ALLMAX - Lista divergências
//    POST /api/banco/divergencias-data/resolver - Resolve uma divergência
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// GET /api/banco/divergencias-data
// Lista possíveis divergências de data detectadas
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { empresa = 'ALLMAX' } = req.query;

    // Buscar pares de lançamentos com:
    // - Mesmo valor (±0.01)
    // - Mesma descrição (primeiros 40 caracteres)
    // - Datas diferentes (±1 a 7 dias)
    // - Empresa igual
    const divergencias = await pool.query(`
      WITH possiveis_duplicatas AS (
        SELECT
          e1.id as id1,
          e1.data as data1,
          e1.descricao_original as desc1,
          e1.valor as valor1,
          e1.status as status1,
          e1.classificacao as class1,
          e1.importado_em as importado1,
          e2.id as id2,
          e2.data as data2,
          e2.descricao_original as desc2,
          e2.valor as valor2,
          e2.status as status2,
          e2.classificacao as class2,
          e2.importado_em as importado2,
          ABS(EXTRACT(DAY FROM (e1.data - e2.data))) as dif_dias
        FROM bank_extratos e1
        JOIN bank_extratos e2 ON
          e1.empresa = e2.empresa
          AND e1.banco = e2.banco
          AND e1.id < e2.id  -- Evita duplicatas do par
          AND ABS(e1.valor - e2.valor) < 0.01
          AND LEFT(e1.descricao_original, 40) = LEFT(e2.descricao_original, 40)
          AND e1.data != e2.data
          AND ABS(EXTRACT(DAY FROM (e1.data - e2.data))) BETWEEN 1 AND 7
        WHERE e1.empresa = $1
          AND e1.banco = 'Asaas'
      )
      SELECT *
      FROM possiveis_duplicatas
      ORDER BY data1 DESC, dif_dias
      LIMIT 100
    `, [empresa]);

    res.json({
      sucesso: true,
      total: divergencias.rows.length,
      divergencias: divergencias.rows.map(d => ({
        registro1: {
          id: d.id1,
          data: d.data1,
          descricao: d.desc1,
          valor: parseFloat(d.valor1),
          status: d.status1,
          classificacao: d.class1,
          importado_em: d.importado1
        },
        registro2: {
          id: d.id2,
          data: d.data2,
          descricao: d.desc2,
          valor: parseFloat(d.valor2),
          status: d.status2,
          classificacao: d.class2,
          importado_em: d.importado2
        },
        diferenca_dias: parseInt(d.dif_dias),
        sugestao: d.importado1 < d.importado2 ? 'usar_data1' : 'usar_data2'
      }))
    });

  } catch (err) {
    console.error('❌ Erro ao buscar divergências:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// POST /api/banco/divergencias-data/resolver
// Resolve uma divergência escolhendo qual data assumir
// Body: { id_manter, id_excluir, data_correta, motivo }
// ============================================================
router.post('/resolver', async (req, res) => {
  try {
    const { id_manter, id_excluir, data_correta, motivo } = req.body;

    if (!id_manter || !id_excluir || !data_correta) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Parâmetros obrigatórios: id_manter, id_excluir, data_correta'
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Buscar dados dos registros
      const registros = await client.query(`
        SELECT id, data, descricao_original, valor, status, classificacao, observacoes
        FROM bank_extratos
        WHERE id IN ($1, $2)
      `, [id_manter, id_excluir]);

      if (registros.rows.length !== 2) {
        throw new Error('Registros não encontrados');
      }

      const regManter = registros.rows.find(r => r.id === id_manter);
      const regExcluir = registros.rows.find(r => r.id === id_excluir);

      // 2. Atualizar registro mantido com data correta
      const observacao_adicional = `
--- CORREÇÃO DE DIVERGÊNCIA DE DATA ---
Data anterior: ${regManter.data.toISOString().split('T')[0]}
Data corrigida: ${data_correta}
Registro duplicado excluído: ID ${id_excluir} (data: ${regExcluir.data.toISOString().split('T')[0]})
Motivo: ${motivo || 'Divergência detectada na importação OFX'}
Data da correção: ${new Date().toISOString().split('T')[0]}
---`;

      await client.query(`
        UPDATE bank_extratos
        SET data = $1,
            observacoes = CASE
              WHEN observacoes IS NULL OR observacoes = '' THEN $2
              ELSE observacoes || E'\n' || $2
            END
        WHERE id = $3
      `, [data_correta, observacao_adicional, id_manter]);

      // 3. Excluir registro duplicado
      await client.query(`
        DELETE FROM bank_extratos
        WHERE id = $1
      `, [id_excluir]);

      await client.query('COMMIT');

      res.json({
        sucesso: true,
        mensagem: 'Divergência resolvida com sucesso',
        registro_atualizado: id_manter,
        registro_excluido: id_excluir,
        data_final: data_correta
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Erro ao resolver divergência:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// GET /api/banco/divergencias-data/pendentes
// Retorna contagem rápida de divergências pendentes
// ============================================================
router.get('/pendentes', async (req, res) => {
  try {
    const { empresa = 'ALLMAX' } = req.query;

    const result = await pool.query(`
      WITH possiveis_duplicatas AS (
        SELECT COUNT(*) as total
        FROM bank_extratos e1
        JOIN bank_extratos e2 ON
          e1.empresa = e2.empresa
          AND e1.banco = e2.banco
          AND e1.id < e2.id
          AND ABS(e1.valor - e2.valor) < 0.01
          AND LEFT(e1.descricao_original, 40) = LEFT(e2.descricao_original, 40)
          AND e1.data != e2.data
          AND ABS(EXTRACT(DAY FROM (e1.data - e2.data))) BETWEEN 1 AND 7
        WHERE e1.empresa = $1
          AND e1.banco = 'Asaas'
      )
      SELECT total FROM possiveis_duplicatas
    `, [empresa]);

    res.json({
      sucesso: true,
      total: parseInt(result.rows[0]?.total || 0)
    });

  } catch (err) {
    console.error('❌ Erro ao contar pendentes:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
