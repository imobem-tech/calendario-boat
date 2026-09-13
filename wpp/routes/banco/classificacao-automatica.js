// ============================================================
// wpp/routes/banco/classificacao-automatica.js — V.2609122220
// SISTEMA INTELIGENTE DE CLASSIFICAÇÃO AUTOMÁTICA
// LÓGICA FINAL:
//   - ENTRADA (CREDITO) → palavras_chave → OK (se encontrou) ou PENDENTE (se não encontrou)
//   - SAÍDA (DEBITO) → chave_aprendida → OK (se encontrou) ou PENDENTE (se não encontrou)
//   - NOTIFICA WhatsApp: APENAS quando status = PENDENTE (não conseguiu classificar)
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
 * Formato: "frase|valorCentavos|tolerancia|observacao"
 * Exemplo: "Hora_MOTOR 586-E2|9800|10|X" (R$ 98,00 ± 10%)
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

    // Converter valor do lançamento para centavos
    const valorLancCentavos = Math.round(Math.abs(value) * 100);

    // Testar cada categoria
    for (const cat of result.rows) {
      const regras = cat.chave_aprendida.split(',');

      for (const regra of regras) {
        const partes = regra.trim().split('|');
        if (partes.length < 4) continue; // Formato inválido

        const [frase, valorRefCentavos, tolerancia, observacao] = partes;

        // 1. Testa FRASE na descrição
        const descNorm = removeAcentos(description);
        const fraseNorm = removeAcentos(frase);

        if (!descNorm.includes(fraseNorm)) {
          continue; // Frase não bate
        }

        // 2. Testa VALOR ± tolerância (em centavos)
        const valorRefInt = parseInt(valorRefCentavos, 10);
        const toleranciaInt = parseInt(tolerancia, 10);

        const variacaoMax = Math.round(valorRefInt * toleranciaInt / 100);
        const valorMin = valorRefInt - variacaoMax;
        const valorMax = valorRefInt + variacaoMax;

        if (valorLancCentavos >= valorMin && valorLancCentavos <= valorMax) {
          // MATCH!
          const valorLancReais = (valorLancCentavos / 100).toFixed(2);
          const rangeMin = (valorMin / 100).toFixed(2);
          const rangeMax = (valorMax / 100).toFixed(2);
          console.log(`✅ [Chave-Aprendida] Match: "${frase}" + valor R$ ${valorLancReais} [R$ ${rangeMin}-${rangeMax}] → ${cat.nome}`);
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
 * Classificação completa - LÓGICA FINAL
 *
 * 1. Identifica se é ENTRADA (CREDITO) ou SAÍDA (DEBITO)
 * 2. ENTRADA → palavras_chave → OK (se encontrou, obs=descrição) ou PENDENTE (notifica WhatsApp)
 * 3. SAÍDA → chave_aprendida → OK (se encontrou, obs=regra) ou PENDENTE (notifica WhatsApp)
 * 4. Notifica WhatsApp: APENAS quando status = PENDENTE (não conseguiu classificar)
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
  // 1️⃣ IDENTIFICAR SE É ENTRADA OU SAÍDA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const isEntrada = (tipo === 'CREDITO');

  if (isEntrada) {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2️⃣ ENTRADA (receita) → palavras_chave → OK
    // Se encontrou categoria → OK (não precisa recibo)
    // Observação recebe a descrição da cobrança
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const resultado = await tentarClassificacaoPalavrasChave({
      description,
      value,
      empresa
    });

    if (resultado) {
      return {
        ...resultado,
        status: 'OK',  // ← OK quando classificada automaticamente
        observacao_padrao: description,  // ← Descrição vai para observação
        classificacao_automatica: true
      };
    }

  } else {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3️⃣ SAÍDA (despesa) → chave_aprendida → OK
    // Despesas têm recibo, mas podem ser aprendidas
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const resultado = await testarChaveAprendida({
      description,
      value,
      empresa
    });

    if (resultado) {
      return {
        ...resultado,
        status: 'OK',  // ← OK quando aprendida (não precisa recibo)
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
 * FORMATO: frase|valorCentavos|tolerancia|observacao
 * Exemplo: "PIX recebido|1|10|Teste" (R$ 0,01 ± 10%)
 */
export async function salvarRegraAprendida({
  categoriaId,
  fraseChave,
  valorCentavos,
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

    // Montar nova regra (valor em centavos com padding de zeros)
    // Exemplo: 1 centavo = "001", 150 centavos = "150"
    const valorPadded = String(valorCentavos).padStart(3, '0');
    const novaRegra = `${fraseChave}|${valorPadded}|${toleranciaPercent}|${observacao}`;

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
