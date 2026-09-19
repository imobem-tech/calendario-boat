// ============================================================
// reclassificar-api.js — V.2609182225
// ENDPOINT PARA RECLASSIFICAR POR PALAVRAS-CHAVE
//
// ✅ OTIMIZAÇÃO BATCH + CACHE + SSE (18/09 22:25):
//    - CACHE: Carrega TODAS categorias UMA VEZ (palavras_chave + chave_aprendida)
//    - MEMÓRIA: Processa tudo em memória (ZERO queries no loop)
//    - BATCH: UPDATE com unnest() (1 query para TODOS os registros)
//    - SSE: Progresso em tempo real via /stream
//    - PERFORMANCE: 500 registros em ~5-10 segundos (antes: 5-10 minutos)
//
// ✅ DUPLA TENTATIVA V.2609150038:
//    - 1ª tentativa: Classificar usando observacoes
//    - 2ª tentativa: Se falhar, tentar com descricao_original
//    - Resultado: Máxima taxa de classificação!
//
// + USA LÓGICA CORRETA: bank_categorias (palavras_chave + chave_aprendida)
// + NÃO USA MAIS: bank_regras_classificacao (tabela antiga)
// + Filtros: empresa (TODAS ou específica)
// + Filtros: intervalo de datas (dataInicio/dataFim)
// + Apenas não classificados (classificacao IS NULL OR = '')
// + IMPORTANTE: Atualiza APENAS classificacao (status não muda!)
// + FIX: Salva ID da categoria (não nome) para JOIN funcionar
// + IMPORTANTE: NÃO busca CR! Apenas reclassifica dados já tratados
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// FUNÇÕES AUXILIARES (CLASSIFICAÇÃO EM MEMÓRIA)
// ============================================================

/**
 * Remove acentos e converte para lowercase
 */
function removeAcentos(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Testa se uma palavra-chave bate com a descrição
 * Suporta wildcards (*) e word boundaries
 */
function testarPalavraChave(description, palavraChave) {
  if (!description || !palavraChave) return false;

  const descNorm = removeAcentos(description);
  const palavraNorm = removeAcentos(palavraChave.trim());

  if (palavraNorm.includes('*')) {
    // Match parcial com wildcard
    const pattern = palavraNorm
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    const regex = new RegExp(pattern, 'i');
    return regex.test(descNorm);
  } else {
    // Palavra exata com word boundary
    const escapedWord = palavraNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    return regex.test(descNorm);
  }
}

/**
 * Classificar por palavras-chave (em memória)
 */
function classificarPorPalavrasChave(description, categorias) {
  if (!description) return null;

  for (const cat of categorias) {
    if (!cat.palavras_chave) continue;

    const palavras = cat.palavras_chave.split(',');

    for (const palavra of palavras) {
      if (testarPalavraChave(description, palavra)) {
        return {
          categoria_id: cat.id,
          categoria_nome: cat.nome,
          tipo: cat.tipo,
          metodo: `Palavra-chave: "${palavra.trim()}"`
        };
      }
    }
  }

  return null;
}

/**
 * Classificar por chave aprendida (em memória)
 * Formato: "frase|valorCentavos|tolerancia|cpfCnpj|observacao"
 */
function classificarPorChaveAprendida(description, value, cpfCnpjOrigem, categorias) {
  if (!description) return null;

  const valorLancCentavos = Math.round(Math.abs(value) * 100);
  const cpfCnpjNorm = cpfCnpjOrigem ? cpfCnpjOrigem.replace(/\D/g, '') : null;

  for (const cat of categorias) {
    if (!cat.chave_aprendida) continue;

    const regras = cat.chave_aprendida.split(',');

    for (const regra of regras) {
      const partes = regra.trim().split('|');
      if (partes.length < 4) continue;

      let frase, valorRefCentavos, tolerancia, cpfCnpj, observacao;

      if (partes.length >= 5) {
        [frase, valorRefCentavos, tolerancia, cpfCnpj, observacao] = partes;
      } else {
        [frase, valorRefCentavos, tolerancia, observacao] = partes;
        cpfCnpj = '*';
      }

      // 1. Testa FRASE
      const descNorm = removeAcentos(description);
      const fraseNorm = removeAcentos(frase);

      if (!descNorm.includes(fraseNorm)) continue;

      // 2. Testa VALOR ± tolerância
      const valorRefInt = parseInt(valorRefCentavos, 10);
      const toleranciaInt = parseInt(tolerancia, 10);
      const variacaoMax = Math.round(valorRefInt * toleranciaInt / 100);
      const valorMin = valorRefInt - variacaoMax;
      const valorMax = valorRefInt + variacaoMax;

      if (valorLancCentavos < valorMin || valorLancCentavos > valorMax) continue;

      // 3. Testa CPF/CNPJ
      if (cpfCnpj && cpfCnpj !== '*') {
        const cpfCnpjRegraNorm = cpfCnpj.replace(/\D/g, '');
        if (!cpfCnpjNorm || cpfCnpjNorm !== cpfCnpjRegraNorm) continue;
      }

      // MATCH!
      return {
        categoria_id: cat.id,
        categoria_nome: cat.nome,
        tipo: cat.tipo,
        observacao_padrao: observacao,
        metodo: 'Chave aprendida'
      };
    }
  }

  return null;
}

/**
 * Classificação completa em memória
 */
function classificarEmMemoria(reg, categorias) {
  // 1ª TENTATIVA: observacoes com palavras_chave
  if (reg.observacoes) {
    const resultado = classificarPorPalavrasChave(reg.observacoes, categorias);
    if (resultado) return resultado;

    const resultadoAprendida = classificarPorChaveAprendida(
      reg.observacoes,
      reg.valor,
      reg.cpf_cnpj_origem,
      categorias
    );
    if (resultadoAprendida) return resultadoAprendida;
  }

  // 2ª TENTATIVA: descricao_original
  if (reg.descricao_original) {
    const resultado = classificarPorPalavrasChave(reg.descricao_original, categorias);
    if (resultado) return resultado;

    const resultadoAprendida = classificarPorChaveAprendida(
      reg.descricao_original,
      reg.valor,
      reg.cpf_cnpj_origem,
      categorias
    );
    if (resultadoAprendida) return resultadoAprendida;
  }

  return null;
}

// ============================================================
// ENDPOINT POST /api/banco/reclassificar (SEM SSE)
// ============================================================
router.post('/', async (req, res) => {
  try {
    const { empresa = 'ALLMAX', dataInicio, dataFim } = req.query;

    // 1. CACHE: Carregar TODAS as categorias UMA VEZ
    const categorias = await pool.query(`
      SELECT id, nome, tipo, palavras_chave, chave_aprendida
      FROM bank_categorias
      WHERE empresa IN ('TODAS', $1)
        AND ativo = true
        AND (
          (palavras_chave IS NOT NULL AND palavras_chave != '')
          OR (chave_aprendida IS NOT NULL AND chave_aprendida != '')
        )
      ORDER BY ordem
    `, [empresa]);

    console.log(`📦 Categorias carregadas: ${categorias.rows.length}`);

    // 2. Buscar registros não classificados
    let query = `
      SELECT id, empresa, descricao_original, observacoes, classificacao, status, valor, tipo, cpf_cnpj_origem
      FROM bank_extratos
      WHERE banco = 'Asaas'
        AND (classificacao IS NULL OR classificacao = '')
    `;

    const params = [];
    let paramIndex = 1;

    if (empresa && empresa !== 'TODAS') {
      query += ` AND empresa = $${paramIndex}`;
      params.push(empresa);
      paramIndex++;
    }

    if (dataInicio && dataFim) {
      query += ` AND data BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dataInicio, dataFim);
      paramIndex += 2;
    }

    query += ` ORDER BY data, id`;

    const registros = await pool.query(query, params);

    console.log(`📊 Registros não classificados: ${registros.rows.length}`);

    // 3. PROCESSAR EM MEMÓRIA
    const stats = {
      analisados: 0,
      semTexto: 0,
      semRegra: 0,
      classificados: 0,
      naoClassificados: 0,
      erros: 0
    };

    const updates = [];

    for (const reg of registros.rows) {
      try {
        stats.analisados++;

        // Sem texto para classificar
        if (!reg.observacoes && !reg.descricao_original) {
          stats.semTexto++;
          stats.naoClassificados++;
          continue;
        }

        // Classificar em memória
        const resultado = classificarEmMemoria(reg, categorias.rows);

        if (!resultado || !resultado.categoria_id) {
          stats.semRegra++;
          stats.naoClassificados++;
          continue;
        }

        // Adicionar ao batch
        updates.push({
          id: reg.id,
          categoria_id: resultado.categoria_id
        });

        stats.classificados++;

      } catch (err) {
        console.error(`❌ Erro ao processar ID ${reg.id}:`, err);
        stats.erros++;
      }
    }

    // 4. BATCH UPDATE com unnest()
    if (updates.length > 0) {
      const ids = updates.map(u => u.id);
      const categoriaIds = updates.map(u => u.categoria_id);

      await pool.query(`
        UPDATE bank_extratos AS e
        SET classificacao = u.categoria_id::TEXT,
            classificado_em = NOW()
        FROM (
          SELECT unnest($1::INTEGER[]) AS id,
                 unnest($2::INTEGER[]) AS categoria_id
        ) AS u
        WHERE e.id = u.id
      `, [ids, categoriaIds]);

      console.log(`✅ Batch UPDATE: ${updates.length} registros`);
    }

    res.json({ sucesso: true, stats });

  } catch (err) {
    console.error('❌ Erro ao reclassificar:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// ENDPOINT GET /api/banco/reclassificar/stream (COM SSE)
// ============================================================
router.get('/stream', async (req, res) => {
  // Configurar SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function enviarEvento(dados) {
    res.write(`data: ${JSON.stringify(dados)}\n\n`);
  }

  try {
    const { empresa = 'ALLMAX', dataInicio, dataFim } = req.query;

    enviarEvento({ tipo: 'inicio', mensagem: 'Iniciando reclassificação...' });

    // 1. CACHE: Carregar categorias
    enviarEvento({ tipo: 'progresso', mensagem: 'Carregando categorias...' });

    const categorias = await pool.query(`
      SELECT id, nome, tipo, palavras_chave, chave_aprendida
      FROM bank_categorias
      WHERE empresa IN ('TODAS', $1)
        AND ativo = true
        AND (
          (palavras_chave IS NOT NULL AND palavras_chave != '')
          OR (chave_aprendida IS NOT NULL AND chave_aprendida != '')
        )
      ORDER BY ordem
    `, [empresa]);

    enviarEvento({
      tipo: 'stats',
      categorias: categorias.rows.length
    });

    // 2. Buscar registros
    enviarEvento({ tipo: 'progresso', mensagem: 'Buscando registros não classificados...' });

    let query = `
      SELECT id, empresa, descricao_original, observacoes, classificacao, status, valor, tipo, cpf_cnpj_origem
      FROM bank_extratos
      WHERE banco = 'Asaas'
        AND (classificacao IS NULL OR classificacao = '')
    `;

    const params = [];
    let paramIndex = 1;

    if (empresa && empresa !== 'TODAS') {
      query += ` AND empresa = $${paramIndex}`;
      params.push(empresa);
      paramIndex++;
    }

    if (dataInicio && dataFim) {
      query += ` AND data BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dataInicio, dataFim);
      paramIndex += 2;
    }

    query += ` ORDER BY data, id`;

    const registros = await pool.query(query, params);

    enviarEvento({
      tipo: 'stats',
      total: registros.rows.length
    });

    // 3. Processar em memória
    const stats = {
      analisados: 0,
      semTexto: 0,
      semRegra: 0,
      classificados: 0,
      naoClassificados: 0,
      erros: 0
    };

    const updates = [];

    for (let i = 0; i < registros.rows.length; i++) {
      const reg = registros.rows[i];

      try {
        stats.analisados++;

        // Progresso a cada 10%
        if (i % Math.max(1, Math.floor(registros.rows.length / 10)) === 0) {
          const progresso = Math.round((i / registros.rows.length) * 100);
          enviarEvento({
            tipo: 'progresso',
            mensagem: `Processando... ${progresso}%`,
            processados: i,
            total: registros.rows.length
          });
        }

        // Sem texto
        if (!reg.observacoes && !reg.descricao_original) {
          stats.semTexto++;
          stats.naoClassificados++;
          continue;
        }

        // Classificar
        const resultado = classificarEmMemoria(reg, categorias.rows);

        if (!resultado || !resultado.categoria_id) {
          stats.semRegra++;
          stats.naoClassificados++;
          continue;
        }

        updates.push({
          id: reg.id,
          categoria_id: resultado.categoria_id
        });

        stats.classificados++;

      } catch (err) {
        console.error(`❌ Erro ao processar ID ${reg.id}:`, err);
        stats.erros++;
      }
    }

    // 4. Batch UPDATE
    if (updates.length > 0) {
      enviarEvento({
        tipo: 'progresso',
        mensagem: `Salvando ${updates.length} classificações...`
      });

      const ids = updates.map(u => u.id);
      const categoriaIds = updates.map(u => u.categoria_id);

      await pool.query(`
        UPDATE bank_extratos AS e
        SET classificacao = u.categoria_id::TEXT,
            classificado_em = NOW()
        FROM (
          SELECT unnest($1::INTEGER[]) AS id,
                 unnest($2::INTEGER[]) AS categoria_id
        ) AS u
        WHERE e.id = u.id
      `, [ids, categoriaIds]);
    }

    // Fim
    enviarEvento({
      tipo: 'concluido',
      stats: {
        analisados: stats.analisados,
        classificados: stats.classificados,
        naoClassificados: stats.naoClassificados,
        semTexto: stats.semTexto,
        semRegra: stats.semRegra,
        erros: stats.erros
      }
    });

    res.end();

  } catch (err) {
    console.error('❌ Erro SSE:', err);
    enviarEvento({
      tipo: 'erro',
      mensagem: err.message
    });
    res.end();
  }
});

export default router;
