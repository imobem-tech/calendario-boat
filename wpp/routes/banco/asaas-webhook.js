// ============================================================
// wpp/routes/banco/asaas-webhook.js — V.260911202000
// WEBHOOK ASAAS - RECEBE EVENTOS EM TEMPO REAL
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Mapa de empresas → código banco Asaas
const EMPRESAS_ASAAS = {
  'ALLMAX': { codigo: 6, conta: 'conta_allmax' },
  'IMOBEM': { codigo: 8, conta: 'conta_imobem' },
  'IMOBAN': { codigo: 9, conta: 'conta_imoban' },
  'SUMMER': { codigo: 10, conta: 'conta_summer' }
};

/**
 * Processa evento de webhook Asaas
 */
export async function handleAsaasWebhook(req, res) {
  try {
    console.log('🔔 Webhook Asaas recebido:', JSON.stringify(req.body, null, 2));

    // VALIDAÇÃO DE SEGURANÇA - Verificar assinatura do Asaas
    const assinaturaAsaas = req.headers['asaas-access-token'] || req.headers['x-webhook-signature'];
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;

    if (webhookSecret && assinaturaAsaas !== webhookSecret) {
      console.error('❌ Assinatura inválida! Possível tentativa de fraude.');
      console.error('   Esperado:', webhookSecret);
      console.error('   Recebido:', assinaturaAsaas);
      return res.status(401).json({ error: 'Assinatura inválida' });
    }

    const evento = req.body;

    // Validar estrutura do evento
    if (!evento.event || !evento.payment) {
      return res.status(400).json({ error: 'Evento inválido' });
    }

    const { event, payment } = evento;

    // Processar apenas eventos relevantes
    const eventosRelevantes = [
      'PAYMENT_RECEIVED',        // Cobrança recebida
      'PAYMENT_CONFIRMED',       // Cobrança confirmada
      'PAYMENT_CREATED',         // Cobrança criada
      'TRANSFER_CREATED',        // Transferência feita
      'PAYMENT_REFUNDED',        // Estorno
      'PAYMENT_UPDATED'          // Atualização
    ];

    if (!eventosRelevantes.includes(event)) {
      console.log(`⏭️  Evento ${event} ignorado`);
      return res.status(200).json({ message: 'Evento ignorado' });
    }

    // Determinar empresa (por enquanto vamos usar uma lógica baseada na chave API ou ID do cliente)
    // TODO: Implementar lógica de identificação da empresa
    const empresa = 'ALLMAX'; // Padrão por enquanto

    // Extrair dados do lançamento
    const lancamento = {
      empresa: empresa,
      banco: 'Asaas',
      codigo_banco: '461', // Código Asaas no BACEN
      nome_banco: 'Asaas IP S.A.',
      tipo_conta: 'Corrente',

      data: payment.paymentDate || payment.dateCreated?.split('T')[0] || new Date().toISOString().split('T')[0],
      valor: event === 'TRANSFER_CREATED' ? -Math.abs(payment.value) : payment.value,

      descricao_original: payment.description || `${event} - ${payment.billingType}`,
      documento: payment.invoiceNumber || payment.id,

      tipo: payment.value > 0 ? 'CREDITO' : 'DEBITO',

      // Dados específicos
      cpf_cnpj_origem: payment.customer || null,
      id_transacao_banco: payment.id,
      tipo_importacao: 'WEBHOOK',

      // Campos extras em JSONB
      campos_extras: JSON.stringify({
        evento: event,
        forma_pagamento: payment.billingType,
        taxa: payment.value - (payment.netValue || payment.value),
        valor_liquido: payment.netValue || payment.value,
        status: payment.status,
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlipUrl,
        nosso_numero: payment.nossoNumero
      })
    };

    // Gerar hash único para evitar duplicatas
    const hashString = `${lancamento.codigo_banco}-${lancamento.data}-${Math.abs(lancamento.valor)}-${lancamento.id_transacao_banco}`;
    const crypto = await import('crypto');
    lancamento.hash_unico = crypto.createHash('md5').update(hashString).digest('hex');

    // Inserir no banco (ignorar duplicatas)
    await inserirLancamento(lancamento);

    // Tentar classificar automaticamente
    await tentarClassificarAutomatico(lancamento.hash_unico);

    console.log('✅ Lançamento processado:', lancamento.hash_unico);

    res.status(200).json({
      success: true,
      message: 'Webhook processado',
      hash: lancamento.hash_unico
    });

  } catch (err) {
    console.error('❌ Erro ao processar webhook Asaas:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Insere lançamento no banco de dados
 */
async function inserirLancamento(lanc) {
  const query = `
    INSERT INTO bank_extratos (
      empresa, banco, codigo_banco, nome_banco, tipo_conta,
      data, valor, descricao_original, documento, tipo,
      cpf_cnpj_origem, id_transacao_banco, tipo_importacao,
      hash_unico, campos_extras, importado_em
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13,
      $14, $15::jsonb, NOW()
    )
    ON CONFLICT (hash_unico) DO NOTHING
  `;

  const valores = [
    lanc.empresa, lanc.banco, lanc.codigo_banco, lanc.nome_banco, lanc.tipo_conta,
    lanc.data, lanc.valor, lanc.descricao_original, lanc.documento, lanc.tipo,
    lanc.cpf_cnpj_origem, lanc.id_transacao_banco, lanc.tipo_importacao,
    lanc.hash_unico, lanc.campos_extras
  ];

  await pool.query(query, valores);
}

/**
 * Tenta classificar lançamento automaticamente usando regras
 */
async function tentarClassificarAutomatico(hashUnico) {
  try {
    // Buscar lançamento
    const lancResult = await pool.query(`
      SELECT id, descricao_original, valor, cpf_cnpj_origem
      FROM bank_extratos
      WHERE hash_unico = $1 AND classificacao IS NULL
    `, [hashUnico]);

    if (lancResult.rows.length === 0) return;

    const lanc = lancResult.rows[0];

    // Buscar regra aplicável
    const regraResult = await pool.query(`
      SELECT id, classificacao, confianca_base, nome_regra
      FROM bank_regras_classificacao
      WHERE ativa = true
        AND (
          banco_especifico IS NULL OR banco_especifico = 'Asaas'
        )
        AND (
          -- Palavras-chave
          (palavras_chave IS NOT NULL AND $1 ~* ANY(palavras_chave))
          OR
          -- Regex pattern
          (regex_pattern IS NOT NULL AND $1 ~ regex_pattern)
        )
      ORDER BY prioridade DESC, taxa_acerto DESC NULLS LAST
      LIMIT 1
    `, [lanc.descricao_original]);

    if (regraResult.rows.length === 0) {
      console.log(`ℹ️  Nenhuma regra encontrada para: "${lanc.descricao_original}"`);
      return;
    }

    const regra = regraResult.rows[0];

    // Classificar
    await pool.query(`
      UPDATE bank_extratos
      SET
        classificacao = $2,
        classificacao_manual = false,
        classificado_por = 'Sistema - Webhook Asaas',
        classificado_em = NOW(),
        confianca = $3
      WHERE id = $1
    `, [lanc.id, regra.classificacao, regra.confianca_base]);

    // Atualizar estatísticas da regra
    await pool.query(`
      UPDATE bank_regras_classificacao
      SET
        vezes_aplicada = vezes_aplicada + 1,
        taxa_acerto = CASE
          WHEN vezes_confirmada > 0 THEN vezes_confirmada::NUMERIC / vezes_aplicada::NUMERIC
          ELSE NULL
        END
      WHERE id = $1
    `, [regra.id]);

    // Registrar no histórico
    await pool.query(`
      INSERT INTO bank_historico_classificacoes
        (extrato_id, regra_id, classificacao_nova, classificado_por, observacao)
      VALUES ($1, $2, $3, 'Sistema - Webhook Asaas', $4)
    `, [lanc.id, regra.id, regra.classificacao, `Regra: ${regra.nome_regra}`]);

    console.log(`✅ Classificado automaticamente: ${regra.classificacao} (confiança: ${regra.confianca_base})`);

  } catch (err) {
    console.error('❌ Erro ao classificar automaticamente:', err.message);
  }
}

// ============================================================
// FIM
// ============================================================
