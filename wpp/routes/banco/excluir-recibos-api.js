// ============================================================
// wpp/routes/banco/excluir-recibos-api.js — V.260914200000
// API PARA EXCLUIR RECIBOS (VERCEL BLOB + BANCO DE DADOS)
// ============================================================

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import { del } from '@vercel/blob';

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const VERCEL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/**
 * DELETE /api/banco/recibos/excluir/:id
 * Exclui TODOS os recibos de um lançamento específico
 * - Remove arquivos do Vercel Blob
 * - Remove URLs do banco de dados
 */
router.delete('/excluir/:id', async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    // Buscar o lançamento e seus recibos
    const result = await client.query(`
      SELECT id, empresa, recibos_urls, descricao_original, valor
      FROM bank_extratos
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Lançamento não encontrado',
        id: parseInt(id)
      });
    }

    const lancamento = result.rows[0];
    const recibos = lancamento.recibos_urls || [];

    if (recibos.length === 0) {
      return res.status(400).json({
        erro: 'Este lançamento não possui recibos',
        id: parseInt(id)
      });
    }

    // Iniciar transação
    await client.query('BEGIN');

    // 1. EXCLUIR DO VERCEL BLOB
    const resultadosExclusao = [];

    for (const recibo of recibos) {
      try {
        await del(recibo.url, { token: VERCEL_BLOB_TOKEN });
        resultadosExclusao.push({
          arquivo: recibo.nome,
          status: 'EXCLUÍDO',
          url: recibo.url
        });
        console.log(`✅ Recibo excluído do Blob: ${recibo.nome}`);
      } catch (err) {
        // Se der erro, registra mas continua
        resultadosExclusao.push({
          arquivo: recibo.nome,
          status: 'ERRO',
          erro: err.message,
          url: recibo.url
        });
        console.error(`❌ Erro ao excluir do Blob: ${recibo.nome}`, err.message);
      }
    }

    // 2. REMOVER URLs DO BANCO
    await client.query(`
      UPDATE bank_extratos
      SET recibos_urls = NULL
      WHERE id = $1
    `, [id]);

    // 3. REGISTRAR NO HISTÓRICO
    await client.query(`
      INSERT INTO bank_historico_classificacoes
        (extrato_id, classificacao_nova, classificado_por, observacao)
      VALUES ($1, $2, $3, $4)
    `, [
      id,
      lancamento.classificacao || 'SEM_CLASSIFICACAO',
      'API - Exclusão de recibos',
      `${recibos.length} recibo(s) excluído(s): ${recibos.map(r => r.nome).join(', ')}`
    ]);

    // Commit da transação
    await client.query('COMMIT');

    res.json({
      sucesso: true,
      mensagem: `${recibos.length} recibo(s) excluído(s) com sucesso`,
      lancamento: {
        id: lancamento.id,
        empresa: lancamento.empresa,
        descricao: lancamento.descricao_original,
        valor: lancamento.valor
      },
      arquivos: resultadosExclusao,
      totalExcluidos: resultadosExclusao.filter(r => r.status === 'EXCLUÍDO').length,
      totalErros: resultadosExclusao.filter(r => r.status === 'ERRO').length
    });

  } catch (err) {
    // Rollback em caso de erro
    await client.query('ROLLBACK');
    console.error('❌ Erro ao excluir recibos:', err);
    res.status(500).json({
      erro: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/banco/recibos/excluir/lote
 * Exclui recibos de MÚLTIPLOS lançamentos em lote
 * Body: { ids: [123, 456, 789] }
 */
router.post('/excluir/lote', async (req, res) => {
  const client = await pool.connect();

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        erro: 'Envie um array de IDs válido',
        exemplo: { ids: [123, 456, 789] }
      });
    }

    // Limitar a 50 lançamentos por vez
    if (ids.length > 50) {
      return res.status(400).json({
        erro: 'Máximo de 50 lançamentos por vez',
        recebidos: ids.length
      });
    }

    // Buscar todos os lançamentos
    const result = await client.query(`
      SELECT id, empresa, recibos_urls, descricao_original, valor
      FROM bank_extratos
      WHERE id = ANY($1::int[])
        AND recibos_urls IS NOT NULL
        AND recibos_urls::TEXT != '[]'
    `, [ids]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Nenhum lançamento encontrado com recibos',
        ids: ids
      });
    }

    await client.query('BEGIN');

    const resultados = [];
    let totalArquivosExcluidos = 0;
    let totalArquivosComErro = 0;

    // Processar cada lançamento
    for (const lancamento of result.rows) {
      const recibos = lancamento.recibos_urls || [];
      const arquivosExcluidos = [];

      // Excluir do Vercel Blob
      for (const recibo of recibos) {
        try {
          await del(recibo.url, { token: VERCEL_BLOB_TOKEN });
          arquivosExcluidos.push({
            arquivo: recibo.nome,
            status: 'EXCLUÍDO'
          });
          totalArquivosExcluidos++;
        } catch (err) {
          arquivosExcluidos.push({
            arquivo: recibo.nome,
            status: 'ERRO',
            erro: err.message
          });
          totalArquivosComErro++;
        }
      }

      // Remover URLs do banco
      await client.query(`
        UPDATE bank_extratos
        SET recibos_urls = NULL
        WHERE id = $1
      `, [lancamento.id]);

      // Registrar no histórico
      await client.query(`
        INSERT INTO bank_historico_classificacoes
          (extrato_id, classificacao_nova, classificado_por, observacao)
        VALUES ($1, $2, $3, $4)
      `, [
        lancamento.id,
        lancamento.classificacao || 'SEM_CLASSIFICACAO',
        'API - Exclusão em lote',
        `${recibos.length} recibo(s) excluído(s): ${recibos.map(r => r.nome).join(', ')}`
      ]);

      resultados.push({
        id: lancamento.id,
        empresa: lancamento.empresa,
        descricao: lancamento.descricao_original?.substring(0, 50),
        valor: lancamento.valor,
        arquivos: arquivosExcluidos,
        totalArquivos: recibos.length
      });
    }

    await client.query('COMMIT');

    res.json({
      sucesso: true,
      mensagem: `${result.rows.length} lançamento(s) processado(s)`,
      totalLancamentos: result.rows.length,
      totalArquivosExcluidos,
      totalArquivosComErro,
      detalhes: resultados
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao excluir recibos em lote:', err);
    res.status(500).json({ erro: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/banco/recibos/excluir/:id/arquivo/:nomeArquivo
 * Exclui UM ÚNICO arquivo de recibo, mantendo os outros
 */
router.delete('/excluir/:id/arquivo/:nomeArquivo', async (req, res) => {
  const client = await pool.connect();

  try {
    const { id, nomeArquivo } = req.params;

    // Buscar o lançamento
    const result = await client.query(`
      SELECT id, empresa, recibos_urls
      FROM bank_extratos
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Lançamento não encontrado' });
    }

    const lancamento = result.rows[0];
    const recibos = lancamento.recibos_urls || [];

    // Encontrar o arquivo específico
    const reciboIndex = recibos.findIndex(r => r.nome === nomeArquivo);

    if (reciboIndex === -1) {
      return res.status(404).json({
        erro: 'Arquivo não encontrado',
        arquivo: nomeArquivo,
        arquivosDisponiveis: recibos.map(r => r.nome)
      });
    }

    const reciboParaExcluir = recibos[reciboIndex];

    await client.query('BEGIN');

    // 1. Excluir do Vercel Blob
    try {
      await del(reciboParaExcluir.url, { token: VERCEL_BLOB_TOKEN });
      console.log(`✅ Arquivo excluído do Blob: ${nomeArquivo}`);
    } catch (err) {
      console.error(`❌ Erro ao excluir do Blob: ${nomeArquivo}`, err.message);
      throw new Error(`Erro ao excluir arquivo do Blob: ${err.message}`);
    }

    // 2. Remover da lista no banco
    recibos.splice(reciboIndex, 1);

    await client.query(`
      UPDATE bank_extratos
      SET recibos_urls = $2::jsonb
      WHERE id = $1
    `, [id, recibos.length > 0 ? JSON.stringify(recibos) : null]);

    // 3. Registrar no histórico
    await client.query(`
      INSERT INTO bank_historico_classificacoes
        (extrato_id, classificacao_nova, classificado_por, observacao)
      VALUES ($1, $2, $3, $4)
    `, [
      id,
      lancamento.classificacao || 'SEM_CLASSIFICACAO',
      'API - Exclusão individual de arquivo',
      `Arquivo excluído: ${nomeArquivo}. ${recibos.length} arquivo(s) restante(s)`
    ]);

    await client.query('COMMIT');

    res.json({
      sucesso: true,
      mensagem: 'Arquivo excluído com sucesso',
      lancamentoId: lancamento.id,
      arquivoExcluido: nomeArquivo,
      arquivosRestantes: recibos.length,
      recibosRestantes: recibos.map(r => r.nome)
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao excluir arquivo:', err);
    res.status(500).json({ erro: err.message });
  } finally {
    client.release();
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
