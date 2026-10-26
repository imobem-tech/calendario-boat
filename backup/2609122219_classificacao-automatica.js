// ============================================================
// wpp/routes/banco/classificacao-automatica.js — V.260912150000
// SISTEMA INTELIGENTE DE CLASSIFICAÇÃO AUTOMÁTICA
// LÓGICA:
//   - Cobrança Asaas → palavras_chave → PENDENTE (precisa recibo)
//   - Outros → chave_aprendida → OK (não precisa recibo)
// APRENDIZADO: frase|valor|tolerancia|observacao
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
 * Testa CHAVE APRENDIDA (frase + valor ± tolerância)
 * Formato: "frase|valor|tolerancia|observacao"
 * Exemplo: "Hora_MOTOR 586-E2|98|10|X"
 */
async function testarChaveAprendida({ description, value, empresa }) {
  if (!description) return null;

  try {
    // Buscar categorias com chave_aprendida
    const result = await pool.query(`
      SELECT
        id,
        nome,
        tipo,
        chave_aprendida
      FROM bank_categorias
      WHERE empresa IN ('TODAS', $1)
        AND ativo = true
        AND chave_aprendida IS NOT NULL
        AND chave_aprendida != ''
      ORDER BY ordem
    `, [empresa]);

    const valorLancInteiro = Math.floor(Math.abs(value));

    // Testar cada categoria
    for (const cat of result.rows) {
      const regras = cat.chave_aprendida.split(',');

      for (const regra of regras) {
        const partes = regra.trim().split('|');
        if (partes.length < 4) continue; // Formato inválido

        const [frase, valorRef, tolerancia, observacao] = partes;

        // 1. Testa FRASE na descrição
        const descNorm = removeAcentos(description);
        const fraseNorm = removeAcentos(frase);

        if (!descNorm.includes(fraseNorm)) {
          continue; // Frase não bate
        }

        // 2. Testa VALOR ± tolerância
        const valorRefInt = parseInt(valorRef, 10);
        const toleranciaInt = parseInt(tolerancia, 10);

        const variacaoMax = Math.floor(valorRefInt * toleranciaInt / 100);
        const valorMin = valorRefInt - variacaoMax;
        const valorMax = valorRefInt + variacaoMax;

        if (valorLancInteiro >= valorMin && valorLancInteiro <= valorMax) {
          // MATCH!
          console.log(`✅ [Chave-Aprendida] Match: "${frase}" + valor ${valorLancInteiro} [${valorMin}-${valorMax}] → ${cat.nome}`);
          return {
            categoria_id: cat.id,
            categoria_nome: cat.nome,
            tipo: cat.tipo,
            observacao_padrao: observacao,
            metodo: 'Chave aprendida'
          };
        }
      }
    }

    return null;

  } catch (err) {
    console.error('❌ Erro ao testar chave aprendida:', err.message);
    return null;
  }
}

/**
 * Classificar por palavras-chave (cobranças Asaas)
 */
async function tentarClassificacaoPalavrasChave({ description, value, empresa }) {
  if (!description) return null;

  try {
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

    for (const cat of result.rows) {
      const palavras = cat.palavras_chave.split(',');

      for (const palavra of palavras) {
        if (testarPalavraChave(description, palavra)) {
          console.log(`✅ [Palavras-Chave] Match: "${palavra.trim()}" → ${cat.nome}`);
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

  } catch (err) {
    console.error('❌ Erro ao classificar por palavras-chave:', err.message);
    return null;
  }
}

/**
 * Classificação completa - NOVA LÓGICA
 *
 * 1. Identifica se é COBRANÇA Asaas
 * 2. Cobrança → palavras_chave → PENDENTE
 * 3. Outros → chave_aprendida → OK
 */
export async function classificarLancamento({
  description,
  value,
  tipo,
  empresa,
  tipo_importacao,
  id_transacao_banco
}) {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1️⃣ IDENTIFICAR SE É COBRANÇA ASAAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const isCobrancaAsaas = (
    tipo_importacao === 'WEBHOOK' ||
    id_transacao_banco?.startsWith('pay_') ||
    id_transacao_banco?.startsWith('pix_')  // PIX de cobrança também
  );

  if (isCobrancaAsaas) {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2️⃣ COBRANÇA ASAAS → palavras_chave → PENDENTE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const resultado = await tentarClassificacaoPalavrasChave({
      description,
      value,
      empresa
    });

    if (resultado) {
      return {
        ...resultado,
        status: 'PENDENTE',  // ← SEMPRE PENDENTE (precisa recibo)
        classificacao_automatica: true
      };
    }

  } else {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3️⃣ OUTROS → chave_aprendida → OK
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const resultado = await testarChaveAprendida({
      description,
      value,
      empresa
    });

    if (resultado) {
      return {
        ...resultado,
        status: 'OK',  // ← SEMPRE OK (não precisa recibo)
        classificacao_automatica: true
      };
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NÃO ENCONTROU CLASSIFICAÇÃO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return {
    categoria_id: null,
    categoria_nome: null,
    tipo: null,
    status: 'PENDENTE',
    classificacao_automatica: false,
    metodo: 'Nenhuma regra encontrada'
  };
}

/**
 * Salvar nova regra aprendida
 */
export async function salvarRegraAprendida({
  categoriaId,
  fraseChave,
  valorInteiro,
  toleranciaPercent,
  observacao
}) {
  try {
    // Buscar categoria atual
    const result = await pool.query(`
      SELECT chave_aprendida FROM bank_categorias WHERE id = $1
    `, [categoriaId]);

    if (result.rows.length === 0) {
      throw new Error('Categoria não encontrada');
    }

    // Montar nova regra
    const novaRegra = `${fraseChave}|${valorInteiro}|${toleranciaPercent}|${observacao}`;

    // Adicionar à lista existente
    let chaveAprendida = result.rows[0].chave_aprendida || '';

    if (chaveAprendida.trim()) {
      chaveAprendida += `, ${novaRegra}`;
    } else {
      chaveAprendida = novaRegra;
    }

    // Atualizar banco
    await pool.query(`
      UPDATE bank_categorias
      SET chave_aprendida = $1
      WHERE id = $2
    `, [chaveAprendida, categoriaId]);

    console.log(`✅ Regra aprendida salva: ${novaRegra}`);
    return true;

  } catch (err) {
    console.error('❌ Erro ao salvar regra aprendida:', err.message);
    throw err;
  }
}

// ============================================================
// FIM
// ============================================================
