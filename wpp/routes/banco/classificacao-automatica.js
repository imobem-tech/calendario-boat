// ============================================================
// wpp/routes/banco/classificacao-automatica.js — V.2609132304
// SISTEMA INTELIGENTE DE CLASSIFICAÇÃO AUTOMÁTICA
// NOVO (13/09 22:52): Suporte a CPF/CNPJ na chave_aprendida
// NOVO (13/09 23:04): salvarRegraAprendida com parâmetro cpfCnpj
// LÓGICA NOVA (13/09/2026):
//   - QUALQUER TIPO (CREDITO ou DEBITO):
//     1. Tenta palavras_chave primeiro (simples)
//     2. Se não achou, tenta chave_aprendida (complexa)
//     3. Se achou em qualquer → status OK
//     4. Se não achou nenhum → status PENDENTE (notifica WhatsApp)
// APRENDIZADO: frase|valorCentavos|tolerancia|observacao
// EXEMPLO: "PIX recebido|001|10|Teste" → R$ 0,01 ± 10%
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
 * Testa CHAVE APRENDIDA (frase + valor ± tolerância + CPF/CNPJ)
 * Formato ANTIGO: "frase|valorCentavos|tolerancia|observacao"
 * Formato NOVO:   "frase|valorCentavos|tolerancia|cpfCnpj|observacao"
 *
 * cpfCnpj: CPF/CNPJ específico OU "*" para qualquer pessoa
 * Exemplo: "Hora_MOTOR 586-E2|9800|10|12345678901|Fulano" (só CPF 123...)
 * Exemplo: "Hora_MOTOR 586-E2|9800|10|*|Qualquer pessoa" (qualquer)
 */
async function testarChaveAprendida({ description, value, empresa, cpfCnpjOrigem }) {
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

    // Normalizar CPF/CNPJ para comparação (só números)
    const cpfCnpjNorm = cpfCnpjOrigem ? cpfCnpjOrigem.replace(/\D/g, '') : null;

    // Testar cada categoria
    for (const cat of result.rows) {
      const regras = cat.chave_aprendida.split(',');

      for (const regra of regras) {
        const partes = regra.trim().split('|');
        if (partes.length < 4) continue; // Formato inválido

        // Formato: frase|valor|tol|cpfCnpj|obs (5 partes) OU frase|valor|tol|obs (4 partes - retrocompatível)
        let frase, valorRefCentavos, tolerancia, cpfCnpj, observacao;

        if (partes.length >= 5) {
          // NOVO formato (5 partes)
          [frase, valorRefCentavos, tolerancia, cpfCnpj, observacao] = partes;
        } else {
          // ANTIGO formato (4 partes) - trata como "*" (qualquer pessoa)
          [frase, valorRefCentavos, tolerancia, observacao] = partes;
          cpfCnpj = '*';
        }

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

        if (valorLancCentavos < valorMin || valorLancCentavos > valorMax) {
          continue; // Valor não bate
        }

        // 3. Testa CPF/CNPJ (se não for "*")
        if (cpfCnpj && cpfCnpj !== '*') {
          const cpfCnpjRegraNorm = cpfCnpj.replace(/\D/g, '');
          if (!cpfCnpjNorm || cpfCnpjNorm !== cpfCnpjRegraNorm) {
            continue; // CPF/CNPJ não bate
          }
        }

        // MATCH COMPLETO!
        const valorLancReais = (valorLancCentavos / 100).toFixed(2);
        const rangeMin = (valorMin / 100).toFixed(2);
        const rangeMax = (valorMax / 100).toFixed(2);
        const pessoa = cpfCnpj === '*' ? 'qualquer pessoa' : `CPF/CNPJ ${cpfCnpj}`;
        console.log(`✅ [Chave-Aprendida] Match: "${frase}" + valor R$ ${valorLancReais} [R$ ${rangeMin}-${rangeMax}] + ${pessoa} → ${cat.nome}`);

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
 * Classificação completa - LÓGICA NOVA
 *
 * PARA QUALQUER TIPO (CREDITO ou DEBITO):
 * 1. Tenta palavras_chave primeiro
 * 2. Se não encontrou, tenta chave_aprendida
 * 3. Se achou em qualquer método → status OK
 * 4. Se não achou nenhum → status PENDENTE (notifica WhatsApp)
 *
 * PRIORIDADE:
 * - palavras_chave (mais simples, só texto)
 * - chave_aprendida (mais complexa, texto + valor + tolerância)
 */
export async function classificarLancamento({
  description,
  value,
  tipo,
  empresa,
  tipo_importacao,
  id_transacao_banco,
  cpfCnpjOrigem  // NOVO: CPF/CNPJ do cliente (para chave aprendida)
}) {

  console.log(`🔍 [Classificação] Iniciando...`)
  console.log(`   Descrição: "${description}"`)
  console.log(`   Valor: R$ ${value}`)
  console.log(`   Tipo: ${tipo}`)
  console.log(`   Empresa: ${empresa}`)
  if (cpfCnpjOrigem) {
    console.log(`   Cliente: ${cpfCnpjOrigem}`)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1️⃣ TENTAR PALAVRAS-CHAVE (mais simples)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('🔎 [Classificação] Testando palavras_chave...')
  const resultadoPalavras = await tentarClassificacaoPalavrasChave({
    description,
    value,
    empresa
  });

  if (resultadoPalavras) {
    console.log(`✅ [Classificação] Match por palavras_chave: ${resultadoPalavras.categoria_nome}`)
    return {
      ...resultadoPalavras,
      status: 'OK',
      observacao_padrao: description,  // Descrição vai para observação
      classificacao_automatica: true
    };
  }

  console.log('⚠️ [Classificação] Nenhuma palavra-chave encontrada')

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2️⃣ TENTAR CHAVE APRENDIDA (mais complexa)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('🔎 [Classificação] Testando chave_aprendida...')
  const resultadoAprendida = await testarChaveAprendida({
    description,
    value,
    empresa,
    cpfCnpjOrigem  // Passar CPF/CNPJ para verificação
  });

  if (resultadoAprendida) {
    console.log(`✅ [Classificação] Match por chave_aprendida: ${resultadoAprendida.categoria_nome}`)
    return {
      ...resultadoAprendida,
      status: 'OK',
      classificacao_automatica: true
    };
  }

  console.log('⚠️ [Classificação] Nenhuma chave aprendida encontrada')

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3️⃣ NÃO ENCONTROU NENHUMA CLASSIFICAÇÃO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('❌ [Classificação] Nenhuma regra encontrada → PENDENTE')
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
  cpfCnpj,        // NOVO: CPF/CNPJ específico ou "*" para qualquer pessoa
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

    // Montar nova regra - FORMATO NOVO (5 partes): frase|valor|tol|cpfCnpj|obs
    // Exemplo: "Hora_MOTOR 586-E2|9800|10|12345678901|Fulano" (CPF específico)
    // Exemplo: "Hora_MOTOR 586-E2|9800|10|*|Qualquer pessoa" (qualquer)
    const valorPadded = String(valorCentavos).padStart(3, '0');
    const cpfCnpjFinal = cpfCnpj || '*';  // Default para "*" se não informado
    const novaRegra = `${fraseChave}|${valorPadded}|${toleranciaPercent}|${cpfCnpjFinal}|${observacao}`;

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
