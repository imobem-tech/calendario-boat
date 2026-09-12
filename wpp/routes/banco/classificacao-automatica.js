// ============================================================
// wpp/routes/banco/classificacao-automatica.js — V.260912120000
// SISTEMA INTELIGENTE DE CLASSIFICAÇÃO AUTOMÁTICA
// PRIORIDADES: 1) Asaas externalReference → 2) Palavras-chave → 3) Regras antigas
// PALAVRAS-CHAVE: wildcards (*), normalização (sem acentos), case-insensitive
// STATUS: SEMPRE PENDENTE até anexar recibo
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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
    // Exemplo: "Bar*" → encontra "Barco", "Barracão", etc
    const pattern = palavraNorm
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape caracteres especiais
      .replace(/\\\*/g, '.*');                 // Asterisco vira .*
    const regex = new RegExp(pattern, 'i');
    return regex.test(descNorm);
  } else {
    // Palavra exata com word boundary
    // Exemplo: "Barco" → encontra "Mensalidade Barco 123" mas não "Embarcação"
    const escapedWord = palavraNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    return regex.test(descNorm);
  }
}

/**
 * PRIORIDADE 1: Classificar por pagamento Asaas (externalReference)
 */
export async function classificarPagamentoAsaas({ externalReference, description, value, empresa }) {
  if (!externalReference) return null;

  try {
    // Buscar cobrança no Asaas que tem esse externalReference
    const result = await pool.query(`
      SELECT
        categoria_id,
        categoria_nome,
        categoria_tipo
      FROM bank_asaas_charges
      WHERE external_reference = $1
        AND empresa = $2
      LIMIT 1
    `, [externalReference, empresa]);

    if (result.rows.length > 0) {
      const cat = result.rows[0];
      console.log(`✅ [P1-Asaas] Classificado por externalReference: ${cat.categoria_nome}`);
      return {
        categoria_id: cat.categoria_id,
        categoria_nome: cat.categoria_nome,
        tipo: cat.categoria_tipo,
        prioridade: 1,
        metodo: 'Asaas externalReference'
      };
    }

    return null;

  } catch (err) {
    console.error('❌ Erro ao classificar por Asaas:', err.message);
    return null;
  }
}

/**
 * PRIORIDADE 2: Classificar por palavras-chave (evidentes)
 */
export async function tentarClassificacaoAutomatica({ description, value, empresa }) {
  if (!description) return null;

  try {
    // Buscar categorias com palavras-chave para esta empresa
    const result = await pool.query(`
      SELECT
        id,
        nome,
        tipo,
        palavras_chave
      FROM bank_categorias
      WHERE empresa IN ('TODAS', $1)
        AND ativo = true
        AND palavras_chave IS NOT NULL
        AND palavras_chave != ''
      ORDER BY ordem
    `, [empresa]);

    // Testar cada categoria
    for (const cat of result.rows) {
      const palavras = cat.palavras_chave.split(',');

      for (const palavra of palavras) {
        if (testarPalavraChave(description, palavra)) {
          console.log(`✅ [P2-Palavras] Match: "${palavra.trim()}" → ${cat.nome}`);
          return {
            categoria_id: cat.id,
            categoria_nome: cat.nome,
            tipo: cat.tipo,
            prioridade: 2,
            metodo: `Palavra-chave: "${palavra.trim()}"`
          };
        }
      }
    }

    return null;

  } catch (err) {
    console.error('❌ Erro ao classificar por palavras-chave:', err.message);
    return null;
  }
}

/**
 * PRIORIDADE 3: Regras antigas (compatibilidade)
 */
export async function classificarPorRegrasAntigas({ description, value, tipo, empresa }) {
  if (!description) return null;

  try {
    const result = await pool.query(`
      SELECT
        categoria_id,
        categoria_nome,
        tipo as categoria_tipo
      FROM bank_regras_classificacao
      WHERE empresa IN ('TODAS', $1)
        AND ativo = true
        AND tipo = $2
        AND (
          (tipo_regra = 'CONTEM' AND LOWER(UNACCENT($3)) LIKE '%' || LOWER(UNACCENT(palavra_chave)) || '%')
          OR
          (tipo_regra = 'VALOR_EXATO' AND ABS($4 - valor_referencia) < 0.01)
        )
      ORDER BY ordem
      LIMIT 1
    `, [empresa, tipo, description, value]);

    if (result.rows.length > 0) {
      const regra = result.rows[0];
      console.log(`✅ [P3-Regras] Classificado por regra antiga: ${regra.categoria_nome}`);
      return {
        categoria_id: regra.categoria_id,
        categoria_nome: regra.categoria_nome,
        tipo: regra.categoria_tipo,
        prioridade: 3,
        metodo: 'Regra antiga (tabela bank_regras_classificacao)'
      };
    }

    return null;

  } catch (err) {
    console.error('❌ Erro ao classificar por regras antigas:', err.message);
    return null;
  }
}

/**
 * Classificação completa em 3 prioridades
 * SEMPRE retorna status PENDENTE (aguarda recibo)
 */
export async function classificarLancamento({ externalReference, description, value, tipo, empresa }) {
  let resultado = null;

  // PRIORIDADE 1: Asaas externalReference
  resultado = await classificarPagamentoAsaas({
    externalReference,
    description,
    value,
    empresa
  });

  // PRIORIDADE 2: Palavras-chave
  if (!resultado) {
    resultado = await tentarClassificacaoAutomatica({
      description,
      value,
      empresa
    });
  }

  // PRIORIDADE 3: Regras antigas
  if (!resultado) {
    resultado = await classificarPorRegrasAntigas({
      description,
      value,
      tipo,
      empresa
    });
  }

  // Se encontrou classificação, SEMPRE retorna PENDENTE
  if (resultado) {
    return {
      ...resultado,
      status: 'PENDENTE',  // ⚠️ SEMPRE PENDENTE até anexar recibo
      classificacao_automatica: true
    };
  }

  // Não encontrou classificação
  return {
    categoria_id: null,
    categoria_nome: null,
    tipo: null,
    status: 'PENDENTE',
    classificacao_automatica: false,
    metodo: 'Nenhuma regra encontrada'
  };
}

// ============================================================
// FIM
// ============================================================
