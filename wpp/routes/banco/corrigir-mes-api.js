// ============================================================
// corrigir-mes-api.js — V.2610011250
// CORREÇÃO E AUDITORIA DE MÊS ESPECÍFICO
//
// ✅ FUNCIONALIDADES:
//    - Audita mês específico (ex: 09/2026)
//    - Detecta duplicatas (mesmo fitid ou descrição+valor+data)
//    - Remove duplicatas mantendo o melhor registro
//    - Corrige status e classificações
//    - Gera relatório detalhado
//
// ROTAS:
//    GET  /api/banco/corrigir-mes/auditar?mes=2026-09&empresa=ALLMAX
//    POST /api/banco/corrigir-mes/limpar-duplicatas
//    POST /api/banco/corrigir-mes/resetar
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// GET /api/banco/corrigir-mes/auditar
// Audita um mês específico e retorna problemas encontrados
// ============================================================
router.get('/auditar', async (req, res) => {
  try {
    const { mes, empresa = 'ALLMAX' } = req.query;

    if (!mes) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Parâmetro "mes" obrigatório (formato: YYYY-MM)'
      });
    }

    const mesInicio = `${mes}-01`;
    const mesFim = `${mes}-31`;

    // 1. Estatísticas gerais do mês
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'OK' THEN 1 END) as ok,
        COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendente,
        COUNT(CASE WHEN status IS NULL THEN 1 END) as sem_status,
        COUNT(CASE WHEN classificacao IS NULL THEN 1 END) as sem_classificacao,
        COUNT(CASE WHEN classificacao_manual = true THEN 1 END) as manual,
        COUNT(CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN 1 END) as com_recibos,
        SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END) as total_credito,
        SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END) as total_debito
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND data BETWEEN $2 AND $3
    `, [empresa, mesInicio, mesFim]);

    // 2. Detectar duplicatas por fitid
    const duplicatasFitid = await pool.query(`
      SELECT
        id_transacao_banco as fitid,
        COUNT(*) as quantidade,
        array_agg(id ORDER BY importado_em) as ids,
        array_agg(data ORDER BY importado_em) as datas,
        array_agg(status ORDER BY importado_em) as statuses,
        MAX(CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN 1 ELSE 0 END) as tem_recibo
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND data BETWEEN $2 AND $3
        AND id_transacao_banco IS NOT NULL
      GROUP BY id_transacao_banco
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `, [empresa, mesInicio, mesFim]);

    // 3. Detectar duplicatas por descrição+valor+data
    const duplicatasDesc = await pool.query(`
      SELECT
        data,
        valor,
        LEFT(descricao_original, 50) as descricao,
        COUNT(*) as quantidade,
        array_agg(id ORDER BY importado_em) as ids,
        array_agg(id_transacao_banco ORDER BY importado_em) as fitids,
        MAX(CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN 1 ELSE 0 END) as tem_recibo
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND data BETWEEN $2 AND $3
      GROUP BY data, valor, LEFT(descricao_original, 50)
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `, [empresa, mesInicio, mesFim]);

    // 4. Registros problemáticos
    const problemas = await pool.query(`
      SELECT
        id,
        data,
        descricao_original,
        valor,
        tipo,
        status,
        classificacao,
        classificacao_manual,
        id_transacao_banco,
        recibos_urls,
        importado_em
      FROM bank_extratos
      WHERE empresa = $1
        AND banco = 'Asaas'
        AND data BETWEEN $2 AND $3
        AND (
          status IS NULL
          OR (status = 'PENDENTE' AND classificacao IS NOT NULL)
          OR (classificacao IS NULL AND classificacao_manual IS NULL)
        )
      ORDER BY data, id
      LIMIT 50
    `, [empresa, mesInicio, mesFim]);

    res.json({
      sucesso: true,
      mes,
      empresa,
      estatisticas: stats.rows[0],
      problemas: {
        duplicatas_fitid: {
          total: duplicatasFitid.rows.length,
          registros_afetados: duplicatasFitid.rows.reduce((sum, d) => sum + d.quantidade, 0),
          lista: duplicatasFitid.rows
        },
        duplicatas_descricao: {
          total: duplicatasDesc.rows.length,
          registros_afetados: duplicatasDesc.rows.reduce((sum, d) => sum + d.quantidade, 0),
          lista: duplicatasDesc.rows
        },
        registros_problematicos: {
          total: problemas.rows.length,
          lista: problemas.rows.map(r => ({
            id: r.id,
            data: r.data,
            descricao: r.descricao_original,
            valor: parseFloat(r.valor),
            status: r.status,
            classificacao: r.classificacao,
            problema: !r.status ? 'SEM_STATUS' :
                     (r.status === 'PENDENTE' && r.classificacao) ? 'PENDENTE_MAS_CLASSIFICADO' :
                     (!r.classificacao && !r.classificacao_manual) ? 'SEM_CLASSIFICACAO' : 'OUTRO'
          }))
        }
      }
    });

  } catch (err) {
    console.error('❌ Erro ao auditar mês:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// POST /api/banco/corrigir-mes/limpar-duplicatas
// Remove duplicatas mantendo o melhor registro
// Body: { mes, empresa, criterio: 'mais_recente' | 'com_recibo' | 'manual' }
// ============================================================
router.post('/limpar-duplicatas', async (req, res) => {
  try {
    const { mes, empresa = 'ALLMAX', criterio = 'com_recibo' } = req.body;

    if (!mes) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Parâmetro "mes" obrigatório (formato: YYYY-MM)'
      });
    }

    const mesInicio = `${mes}-01`;
    const mesFim = `${mes}-31`;

    const client = await pool.connect();
    let removidos = 0;
    let mantidos = 0;

    try {
      await client.query('BEGIN');

      // Buscar duplicatas por fitid
      const duplicatas = await client.query(`
        SELECT
          id_transacao_banco as fitid,
          array_agg(
            json_build_object(
              'id', id,
              'data', data,
              'status', status,
              'classificacao', classificacao,
              'classificacao_manual', classificacao_manual,
              'tem_recibo', CASE WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0 THEN 1 ELSE 0 END,
              'importado_em', importado_em
            ) ORDER BY importado_em
          ) as registros
        FROM bank_extratos
        WHERE empresa = $1
          AND banco = 'Asaas'
          AND data BETWEEN $2 AND $3
          AND id_transacao_banco IS NOT NULL
        GROUP BY id_transacao_banco
        HAVING COUNT(*) > 1
      `, [empresa, mesInicio, mesFim]);

      console.log(`🔍 Encontradas ${duplicatas.rows.length} duplicatas`);

      for (const dup of duplicatas.rows) {
        const registros = dup.registros;

        // Escolher qual manter baseado no critério
        let melhor;

        if (criterio === 'com_recibo') {
          // Prioridade: com recibo > classificação manual > mais recente
          melhor = registros.find(r => r.tem_recibo === 1) ||
                   registros.find(r => r.classificacao_manual === true) ||
                   registros[registros.length - 1];
        } else if (criterio === 'manual') {
          // Prioridade: manual > com recibo > mais recente
          melhor = registros.find(r => r.classificacao_manual === true) ||
                   registros.find(r => r.tem_recibo === 1) ||
                   registros[registros.length - 1];
        } else {
          // mais_recente
          melhor = registros[registros.length - 1];
        }

        // Remover os outros
        const idsParaRemover = registros
          .filter(r => r.id !== melhor.id)
          .map(r => r.id);

        if (idsParaRemover.length > 0) {
          await client.query(`
            DELETE FROM bank_extratos
            WHERE id = ANY($1)
          `, [idsParaRemover]);

          removidos += idsParaRemover.length;
          mantidos++;

          console.log(`✓ Fitid ${dup.fitid}: mantido ID ${melhor.id}, removidos ${idsParaRemover.length}`);
        }
      }

      await client.query('COMMIT');

      res.json({
        sucesso: true,
        mensagem: 'Duplicatas removidas com sucesso',
        duplicatas_processadas: duplicatas.rows.length,
        registros_removidos: removidos,
        registros_mantidos: mantidos,
        criterio_usado: criterio
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Erro ao limpar duplicatas:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// POST /api/banco/corrigir-mes/resetar
// Reseta um mês específico para estado limpo
// Body: { mes, empresa, acao: 'corrigir_status' | 'limpar_tudo' }
// ============================================================
router.post('/resetar', async (req, res) => {
  try {
    const { mes, empresa = 'ALLMAX', acao = 'corrigir_status' } = req.body;

    if (!mes) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Parâmetro "mes" obrigatório (formato: YYYY-MM)'
      });
    }

    const mesInicio = `${mes}-01`;
    const mesFim = `${mes}-31`;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (acao === 'corrigir_status') {
        // Corrigir apenas status inconsistentes
        const result = await client.query(`
          UPDATE bank_extratos
          SET status = CASE
            WHEN classificacao IS NOT NULL AND classificacao != '' THEN 'OK'
            ELSE 'PENDENTE'
          END
          WHERE empresa = $1
            AND banco = 'Asaas'
            AND data BETWEEN $2 AND $3
            AND (
              status IS NULL
              OR (status = 'PENDENTE' AND classificacao IS NOT NULL AND classificacao != '')
            )
          RETURNING id
        `, [empresa, mesInicio, mesFim]);

        await client.query('COMMIT');

        res.json({
          sucesso: true,
          mensagem: 'Status corrigidos com sucesso',
          registros_atualizados: result.rowCount
        });

      } else if (acao === 'limpar_tudo') {
        // PERIGO: Remove TODOS os registros do mês
        const result = await client.query(`
          DELETE FROM bank_extratos
          WHERE empresa = $1
            AND banco = 'Asaas'
            AND data BETWEEN $2 AND $3
          RETURNING id
        `, [empresa, mesInicio, mesFim]);

        await client.query('COMMIT');

        res.json({
          sucesso: true,
          mensagem: '⚠️ MÊS COMPLETAMENTE LIMPO - Reimporte o OFX!',
          registros_removidos: result.rowCount
        });

      } else {
        throw new Error('Ação inválida. Use: corrigir_status ou limpar_tudo');
      }

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Erro ao resetar mês:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
