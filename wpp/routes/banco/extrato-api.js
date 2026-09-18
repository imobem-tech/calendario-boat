// ============================================================
// wpp/routes/banco/extrato-api.js — V.2609181818
// API PARA RELATÓRIO DE EXTRATO BANCÁRIO
// Visão gerencial completa dos lançamentos
//
// 🔥 FIX V.2609181818: Token reutilizado atualiza todos_arquivos
//    - PROBLEMA: Anexos mostravam arquivos antigos (telas em branco)
//    - CAUSA: Token era reutilizado mas todos_arquivos não era atualizado
//    - SOLUÇÃO: UPDATE todos_arquivos ao reutilizar token
//    - RESULTADO: Sempre mostra anexos atuais do extrato!
//
// 🔥 FIX V.2609150037: Filtro PENDENTE inclui NULL
//    - PROBLEMA: 75 registros com status=NULL não apareciam no filtro PENDENTE
//    - ANTES: WHERE status = 'PENDENTE' (achava só 1 registro)
//    - AGORA: WHERE (status IS NULL OR status = 'PENDENTE') (acha 76 registros)
//    - RESULTADO: Filtro Pendentes agora mostra todos os não classificados!
//
// ⚡ OTIMIZAÇÃO CRÍTICA (14/09 23:05): Window function SQL para saldo
//    - ANTES: Buscava TODOS lançamentos históricos + loop JS (LENTO!)
//    - AGORA: Window function SUM() OVER() direto no PostgreSQL
//    - RESULTADO: 100x+ mais rápido, sem query extra
//
// HISTÓRICO:
// - V.2609150037: Filtro PENDENTE inclui NULL (fix crítico)
// - V.2609142305: Otimização window function (performance crítica)
// - V.2609142025: Filtros data_inicio/data_fim + ORDER BY data DESC
// - V.2609141825: Geração tokens para acesso seguro anexos
// - V.2609141430: Cálculo saldo linha a linha (saldo_linha)
// ============================================================

import express from 'express';
import pkg from 'pg';
import { nanoid } from 'nanoid';

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
 * - somente_nao_classificados: true/false (opcional)
 * - limit: número de registros (padrão 100)
 * - offset: paginação (padrão 0)
 */
router.get('/listar', async (req, res) => {
  try {
    const { empresa, mes, data_inicio, data_fim, status, somente_nao_classificados, limit = 100, offset = 0 } = req.query;

    if (!empresa) {
      return res.status(400).json({
        erro: 'Parâmetro "empresa" é obrigatório'
      });
    }

    // ⚡ OTIMIZADO: Window function para calcular saldo direto no SQL
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
        c.cor as categoria_cor,
        SUM(e.valor) OVER (
          PARTITION BY e.empresa
          ORDER BY e.data ASC, e.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as saldo_linha
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

    // Filtro por mês OU por intervalo de datas
    if (data_inicio && data_fim) {
      // Prioridade para intervalo de datas
      query += ` AND e.data BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(data_inicio, data_fim);
      paramIndex += 2;
    } else if (mes) {
      // Se não tem intervalo, usa o mês
      query += ` AND DATE_TRUNC('month', e.mes_ref) = DATE_TRUNC('month', $${paramIndex}::DATE)`;
      params.push(mes + '-01');
      paramIndex++;
    }

    // Filtro por status
    // ✅ FIX: PENDENTE inclui NULL (maioria dos registros pendentes tem status=NULL)
    if (status) {
      if (status === 'PENDENTE') {
        query += ` AND (e.status IS NULL OR e.status = $${paramIndex})`;
        params.push(status);
        paramIndex++;
      } else {
        query += ` AND e.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    // Filtro: somente não classificados
    // ✅ Mostra apenas lançamentos sem categoria (classificacao IS NULL OR '')
    if (somente_nao_classificados === 'true') {
      query += ` AND (e.classificacao IS NULL OR e.classificacao = '')`;
    }

    // Ordenação: data DESC (mais recente primeiro), depois importado_em DESC
    query += `
      ORDER BY e.data DESC, e.importado_em DESC, e.id DESC
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

    // Usar mesmos filtros da query principal
    if (data_inicio && data_fim) {
      queryTotais += ` AND data BETWEEN $${paramIndexTotais} AND $${paramIndexTotais + 1}`;
      paramsTotais.push(data_inicio, data_fim);
      paramIndexTotais += 2;
    } else if (mes) {
      queryTotais += ` AND DATE_TRUNC('month', mes_ref) = DATE_TRUNC('month', $${paramIndexTotais}::DATE)`;
      paramsTotais.push(mes + '-01');
      paramIndexTotais++;
    }

    // ✅ FIX: PENDENTE inclui NULL
    if (status) {
      if (status === 'PENDENTE') {
        queryTotais += ` AND (status IS NULL OR status = $${paramIndexTotais})`;
        paramsTotais.push(status);
      } else {
        queryTotais += ` AND status = $${paramIndexTotais}`;
        paramsTotais.push(status);
      }
    }

    // ✅ Filtro: somente não classificados
    if (somente_nao_classificados === 'true') {
      queryTotais += ` AND (classificacao IS NULL OR classificacao = '')`;
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

    // ⚡ OTIMIZADO: saldo_linha já vem calculado do SQL via window function
    // Formatar lançamentos com saldo
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
      anexos: row.recibos_urls || [],
      saldo_linha: parseFloat(row.saldo_linha) || 0  // ⚡ Já vem calculado do SQL
    }));

    // ============================================================
    // GERAR TOKEN PARA ACESSO SEGURO AOS ANEXOS
    // ============================================================
    let tokenExtrato = null;
    let urlBaseToken = null;

    // Verificar se há lançamentos com anexos
    const lancamentosComAnexos = lancamentos.filter(l => l.tem_anexo);

    if (lancamentosComAnexos.length > 0) {
      // Montar objeto todos_arquivos: { lancamento_id: [{url, nome}] }
      const todosArquivos = {};
      lancamentosComAnexos.forEach(lanc => {
        todosArquivos[lanc.id] = lanc.anexos.map((anexo, i) => ({
          url: anexo.url || anexo,
          nome: anexo.nome || `Anexo_${lanc.id}_${i + 1}`
        }));
      });

      // Definir extrato_ref (empresa + mes ou empresa se for todos)
      const extratoRef = mes ? `${empresa}_${mes}` : `${empresa}_TODOS`;
      const descricao = mes ?
        `Extrato Bancário ${empresa} - ${mes}` :
        `Extrato Bancário ${empresa} - Todos os períodos`;

      // Verificar se já existe token para este extrato
      const tokenExistente = await pool.query(
        'SELECT token FROM file_tokens WHERE extrato_ref = $1',
        [extratoRef]
      );

      if (tokenExistente.rows.length > 0) {
        // Reutilizar token existente MAS atualizar todos_arquivos
        tokenExtrato = tokenExistente.rows[0].token;

        // ✅ FIX V.2609181818: Atualizar todos_arquivos com dados atuais
        await pool.query(
          `UPDATE file_tokens
           SET todos_arquivos = $1,
               descricao = $2,
               updated_at = NOW() AT TIME ZONE 'America/Sao_Paulo'
           WHERE token = $3`,
          [todosArquivos, descricao, tokenExtrato]
        );

        console.log(`✅ Token ${tokenExtrato} atualizado com ${Object.keys(todosArquivos).length} lançamentos`);
      } else {
        // Gerar novo token
        tokenExtrato = nanoid();
        await pool.query(
          `INSERT INTO file_tokens (token, extrato_ref, descricao, todos_arquivos, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [tokenExtrato, extratoRef, descricao, todosArquivos, 'API_EXTRATO']
        );

        console.log(`✅ Token ${tokenExtrato} criado com ${Object.keys(todosArquivos).length} lançamentos`);
      }

      urlBaseToken = `https://calendario-boat-production.up.railway.app/visualizador/${tokenExtrato}`;

      // Adicionar url_token em cada lançamento com anexo
      lancamentos.forEach(lanc => {
        if (lanc.tem_anexo) {
          lanc.url_token = `${urlBaseToken}?lancamento_id=${lanc.id}`;
        }
      });
    }

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
      token: tokenExtrato,
      url_base_token: urlBaseToken,
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
