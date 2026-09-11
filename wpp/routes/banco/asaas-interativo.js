// ============================================================
// ASAAS WEBHOOK INTERATIVO
// V.260911221000
//
// FUNCIONALIDADES:
// 1. Quando webhook chegar → Perguntar no grupo o que é
// 2. Tratar resposta com lançamentos padrão
// 3. Se similar → aceitar
// 4. Se diferente → questionar
// 5. Salvar documento (se tiver imagem)
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

import GRUPOS_FINANCEIROS from '../config/grupos-financeiros.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Estado de aguardo de respostas sobre webhooks
const aguardandoRespostaWebhook = new Map();
// Chave: {empresa}-{id_transacao}
// Valor: { grupoId, extratoId, valor, data, descricao, timestamp }

/**
 * Perguntar no grupo sobre lançamento do Asaas
 */
export async function perguntarSobreLancamentoAsaas(sock, empresa, lancamento) {
  try {
    // Buscar grupo da empresa
    const grupoId = GRUPOS_FINANCEIROS[empresa];

    if (!grupoId) {
      console.log(`⚠️ Grupo financeiro não configurado para ${empresa}`);
      return;
    }

    // Montar mensagem
    let msg = `💰 *NOVO LANÇAMENTO RECEBIDO*\n\n`;
    msg += `📅 Data: ${lancamento.data}\n`;
    msg += `💵 Valor: R$ ${Math.abs(lancamento.valor).toFixed(2)}\n`;
    msg += `🏦 Banco: Asaas\n`;
    msg += `🏢 Empresa: ${empresa}\n\n`;

    if (lancamento.descricao_original) {
      msg += `📝 Descrição do banco:\n"${lancamento.descricao_original}"\n\n`;
    }

    msg += `❓ *DO QUE SE TRATA ESTE LANÇAMENTO?*\n\n`;
    msg += `💡 Responda com:\n`;
    msg += `• Nome/descrição do lançamento\n`;
    msg += `• Ou envie foto do recibo/comprovante\n\n`;
    msg += `Aguardando resposta...`;

    await sock.sendMessage(grupoId, { text: msg });

    // Guardar estado
    const chave = `${empresa}-${lancamento.id_transacao}`;
    aguardandoRespostaWebhook.set(chave, {
      grupoId,
      extratoId: lancamento.id,
      empresa,
      valor: lancamento.valor,
      data: lancamento.data,
      descricao_original: lancamento.descricao_original,
      timestamp: Date.now()
    });

    console.log(`📱 Pergunta enviada para grupo ${empresa}`);

  } catch (err) {
    console.error('❌ Erro ao perguntar no grupo:', err);
  }
}

/**
 * Processar resposta do usuário sobre webhook
 */
export async function processarRespostaWebhook(sock, mensagem, empresa) {
  try {
    // Buscar se tem pergunta pendente para esta empresa
    let estadoEncontrado = null;
    let chaveEncontrada = null;

    for (const [chave, estado] of aguardandoRespostaWebhook.entries()) {
      if (estado.empresa === empresa && estado.grupoId === mensagem.key.remoteJid) {
        estadoEncontrado = estado;
        chaveEncontrada = chave;
        break;
      }
    }

    if (!estadoEncontrado) {
      return false; // Não é resposta a webhook
    }

    const tipo = Object.keys(mensagem.message || {})[0];
    const remetente = mensagem.key.participant;

    // RESPOSTA EM TEXTO
    if (tipo === 'conversation' || tipo === 'extendedTextMessage') {
      const texto = mensagem.message.conversation ||
                   mensagem.message.extendedTextMessage?.text || '';

      await processarRespostaTexto(
        sock,
        estadoEncontrado.grupoId,
        estadoEncontrado,
        texto,
        remetente
      );

      aguardandoRespostaWebhook.delete(chaveEncontrada);
      return true;
    }

    // RESPOSTA COM IMAGEM
    if (tipo === 'imageMessage') {
      // TODO: Processar imagem como recibo
      // Chamar processarReciboWhatsApp com o estado do webhook

      aguardandoRespostaWebhook.delete(chaveEncontrada);
      return true;
    }

    return false;

  } catch (err) {
    console.error('❌ Erro ao processar resposta webhook:', err);
    return false;
  }
}

/**
 * Processar resposta em texto
 */
async function processarRespostaTexto(sock, grupoId, estado, resposta, remetente) {
  try {
    console.log(`💬 Resposta recebida: "${resposta}"`);

    // Buscar lançamentos padrão similares
    const lancamentosSimilares = await buscarLancamentosSimilares(
      estado.empresa,
      resposta,
      estado.valor
    );

    // Se encontrou similares
    if (lancamentosSimilares.length > 0) {
      const maisSimil = lancamentosSimilares[0];

      // Calcular similaridade (simplificado)
      const similaridade = calcularSimilaridade(resposta, maisSimil.descricao);

      // Se muito similar (>80%), aceitar automaticamente
      if (similaridade > 0.80) {
        await classificarComoPadrao(
          estado.extratoId,
          maisSimil.classificacao,
          resposta,
          remetente
        );

        await sock.sendMessage(grupoId, {
          text: `✅ *Lançamento classificado automaticamente!*

📝 Descrição: "${resposta}"
🔖 Categoria: ${maisSimil.classificacao}
💡 Baseado em: "${maisSimil.descricao}" (${Math.round(similaridade * 100)}% similar)

✓ Lançamento #${estado.extratoId} atualizado.`
        });

        return;
      }

      // Se similar mas não muito (60-80%), confirmar
      if (similaridade > 0.60) {
        await sock.sendMessage(grupoId, {
          text: `🤔 *Confirmação necessária*

Sua resposta: "${resposta}"

📊 *Lançamento similar encontrado:*
📝 "${maisSimil.descricao}"
🔖 Categoria: ${maisSimil.classificacao}
📈 Similaridade: ${Math.round(similaridade * 100)}%

*Classificar como "${maisSimil.classificacao}"?* (S/N)`
        });

        // TODO: Aguardar confirmação

        return;
      }
    }

    // Não encontrou similar - criar novo
    await classificarComoNovo(
      estado.extratoId,
      resposta,
      remetente
    );

    await sock.sendMessage(grupoId, {
      text: `✅ *Novo tipo de lançamento cadastrado!*

📝 Descrição: "${resposta}"
🔖 Categoria: "Outros - ${resposta}"

💡 *Aprendi algo novo!*
Da próxima vez que aparecer "${resposta}", classificarei automaticamente.

✓ Lançamento #${estado.extratoId} atualizado.`
    });

  } catch (err) {
    console.error('❌ Erro ao processar resposta texto:', err);
  }
}

/**
 * Buscar lançamentos similares anteriores
 */
async function buscarLancamentosSimilares(empresa, texto, valor) {
  try {
    // Buscar lançamentos já classificados dessa empresa
    // com valor similar e descrição similar

    const valorMin = valor * 0.80;
    const valorMax = valor * 1.20;

    const resultado = await pool.query(`
      SELECT
        descricao_original,
        classificacao,
        COUNT(*) as ocorrencias
      FROM bank_extratos
      WHERE empresa = $1
        AND classificacao IS NOT NULL
        AND ABS(valor) BETWEEN $2 AND $3
      GROUP BY descricao_original, classificacao
      ORDER BY ocorrencias DESC
      LIMIT 10
    `, [empresa, valorMin, valorMax]);

    return resultado.rows.map(row => ({
      descricao: row.descricao_original,
      classificacao: row.classificacao,
      ocorrencias: row.ocorrencias
    }));

  } catch (err) {
    console.error('❌ Erro ao buscar similares:', err);
    return [];
  }
}

/**
 * Calcular similaridade entre dois textos (simplificado)
 */
function calcularSimilaridade(texto1, texto2) {
  const t1 = texto1.toLowerCase().trim();
  const t2 = texto2.toLowerCase().trim();

  // Simplificado: apenas verificar palavras em comum
  const palavras1 = t1.split(/\s+/);
  const palavras2 = t2.split(/\s+/);

  let palavrasComuns = 0;
  for (const p1 of palavras1) {
    if (p1.length > 3 && palavras2.some(p2 => p2.includes(p1) || p1.includes(p2))) {
      palavrasComuns++;
    }
  }

  const similaridade = palavrasComuns / Math.max(palavras1.length, palavras2.length);

  return similaridade;
}

/**
 * Classificar usando lançamento padrão
 */
async function classificarComoPadrao(extratoId, classificacao, descricao, remetente) {
  await pool.query(`
    UPDATE bank_extratos
    SET
      classificacao = $2,
      classificacao_manual = true,
      classificado_por = $3,
      classificado_em = NOW(),
      confianca = 0.90
    WHERE id = $1
  `, [extratoId, classificacao, `WhatsApp - ${remetente} (padrão)`]);

  // Criar/atualizar regra
  await pool.query(`
    INSERT INTO bank_regras_classificacao
      (nome_regra, classificacao, palavras_chave, confianca_base, vezes_aplicada)
    VALUES ($1, $2, ARRAY[$3], 0.90, 1)
    ON CONFLICT (nome_regra)
    DO UPDATE SET
      vezes_aplicada = bank_regras_classificacao.vezes_aplicada + 1
  `, [`auto_${descricao.toLowerCase().replace(/\s+/g, '_')}`, classificacao, descricao.toLowerCase()]);
}

/**
 * Classificar como novo tipo
 */
async function classificarComoNovo(extratoId, descricao, remetente) {
  const categoria = `Outros - ${descricao}`;

  await pool.query(`
    UPDATE bank_extratos
    SET
      classificacao = $2,
      classificacao_manual = true,
      classificado_por = $3,
      classificado_em = NOW(),
      confianca = 0.95
    WHERE id = $1
  `, [extratoId, categoria, `WhatsApp - ${remetente} (novo)`]);

  // Criar regra nova
  await pool.query(`
    INSERT INTO bank_regras_classificacao
      (nome_regra, classificacao, palavras_chave, confianca_base, vezes_aplicada)
    VALUES ($1, $2, ARRAY[$3], 0.95, 1)
    ON CONFLICT (nome_regra) DO NOTHING
  `, [`auto_${descricao.toLowerCase().replace(/\s+/g, '_')}`, categoria, descricao.toLowerCase()]);

  // Criar categoria se não existir
  await pool.query(`
    INSERT INTO bank_categorias (nome, tipo, cor, icone, ordem)
    VALUES ($1, 'Outros', '#9CA3AF', '📝', 999)
    ON CONFLICT (nome) DO NOTHING
  `, [categoria]);
}

// ============================================================
// EXPORTAÇÕES
// ============================================================

export {
  perguntarSobreLancamentoAsaas,
  processarRespostaWebhook
};

// ============================================================
// FIM
// ============================================================
