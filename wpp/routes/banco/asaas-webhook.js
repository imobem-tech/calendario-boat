// ============================================================
// wpp/routes/banco/asaas-webhook.js — V.260912000000
// WEBHOOK ASAAS - RECEBE EVENTOS EM TEMPO REAL
// SUPORTE A MÚLTIPLAS CONTAS ASAAS (parâmetro ?empresa=)
// CLASSIFICAÇÃO AUTOMÁTICA POR EMPRESA (categorias filtradas)
// PROCESSAMENTO COMPLETO: cliente + cobrança + status
// NOTIFICAÇÃO WHATSAPP PARA LANÇAMENTOS PENDENTES
// BUSCA CPF/CNPJ REAL DO CUSTOMER NA API ASAAS
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
 * Busca CPF/CNPJ do customer na API Asaas
 */
async function buscarCpfCnpjCustomer(customerId, empresa) {
  if (!customerId || !customerId.startsWith('cus_')) {
    return null;
  }

  try {
    // Buscar API key da empresa
    const apiKeys = {
      'ALLMAX': process.env.ASAAS_API_KEY_ALLMAX,
      'IMOBEM': process.env.ASAAS_API_KEY_IMOBEM,
      'IMOBAN': process.env.ASAAS_API_KEY_IMOBAN,
      'SUMMER': process.env.ASAAS_API_KEY_SUMMER
    };

    const apiKey = apiKeys[empresa];
    if (!apiKey) {
      console.log(`⚠️ API Key Asaas não configurada para ${empresa}`);
      return null;
    }

    // Buscar customer na API Asaas
    const response = await fetch(`https://www.asaas.com/api/v3/customers/${customerId}`, {
      headers: {
        'access_token': apiKey
      }
    });

    if (!response.ok) {
      console.log(`⚠️ Erro ao buscar customer ${customerId}: ${response.status}`);
      return null;
    }

    const customer = await response.json();

    // Retornar CPF ou CNPJ (limpar formatação)
    const cpfCnpj = customer.cpfCnpj;
    if (cpfCnpj) {
      // Remover pontos, traços e barras
      return cpfCnpj.replace(/[^\d]/g, '');
    }
    return null;

  } catch (err) {
    console.error(`❌ Erro ao buscar CPF/CNPJ do customer ${customerId}:`, err.message);
    return null;
  }
}

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

    // Processar apenas eventos relevantes (14 eventos essenciais)
    const eventosRelevantes = [
      // Cobranças (4)
      'PAYMENT_RECEIVED',                // Cobrança recebida (entrada)
      'PAYMENT_CONFIRMED',               // Cobrança confirmada
      'PAYMENT_REFUNDED',                // Estorno (saída)
      'PAYMENT_RECEIVED_IN_CASH_UNDONE', // Desfez recebimento

      // Transferências (3)
      'TRANSFER_CREATED',                // Transferência criada (saída)
      'TRANSFER_DONE',                   // Transferência concluída
      'TRANSFER_FAILED',                 // Transferência falhou

      // Pague Contas (3)
      'BILL_CREATED',                    // Conta paga (saída)
      'BILL_PAID',                       // Pagamento concluído
      'BILL_FAILED',                     // Pagamento falhou

      // PIX Crédito (2)
      'PIX_CREDIT_RECEIVED',             // PIX recebido (entrada)
      'PIX_CREDIT_REFUND_DONE',          // Estorno de PIX (saída)

      // Movimentações Internas (2)
      'INTERNAL_TRANSFER_CREDIT',        // Transferência interna (entrada)
      'INTERNAL_TRANSFER_DEBIT'          // Transferência interna (saída)
    ];

    if (!eventosRelevantes.includes(event)) {
      console.log(`⏭️  Evento ${event} ignorado`);
      return res.status(200).json({ message: 'Evento ignorado' });
    }

    // Identificar empresa pelo parâmetro ?empresa= na URL
    const empresa = req.query.empresa || req.body.empresa;

    if (!empresa) {
      console.error('❌ Empresa não identificada! Use ?empresa=ALLMAX na URL do webhook');
      return res.status(400).json({
        error: 'Empresa não especificada',
        help: 'Configure o webhook com: ?empresa=ALLMAX (ou IMOBEM, IMOBAN, SUMMER)'
      });
    }

    // Validar empresa
    const empresasValidas = ['ALLMAX', 'IMOBEM', 'IMOBAN', 'SUMMER'];
    if (!empresasValidas.includes(empresa)) {
      console.error(`❌ Empresa inválida: ${empresa}`);
      return res.status(400).json({
        error: 'Empresa inválida',
        empresa_recebida: empresa,
        empresas_validas: empresasValidas
      });
    }

    console.log(`🏢 Empresa identificada: ${empresa}`);

    // Buscar CPF/CNPJ real do customer (se for ID Asaas)
    let cpfCnpjOrigem = payment.customer;
    if (payment.customer && payment.customer.startsWith('cus_')) {
      console.log(`🔍 Buscando CPF/CNPJ do customer ${payment.customer}...`);
      const cpfCnpj = await buscarCpfCnpjCustomer(payment.customer, empresa);
      if (cpfCnpj) {
        cpfCnpjOrigem = cpfCnpj;
        console.log(`✅ CPF/CNPJ encontrado: ${cpfCnpj}`);
      } else {
        console.log(`⚠️ CPF/CNPJ não encontrado, mantendo customer ID`);
      }
    }

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
      cpf_cnpj_origem: cpfCnpjOrigem,
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

    // Processar lançamento (cliente, cobrança, classificação, status)
    await processarLancamento(lancamento.hash_unico, event, payment);

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
      data, mes_ref, valor, descricao_original, documento, tipo,
      cpf_cnpj_origem, id_transacao_banco, tipo_importacao,
      hash_unico, campos_extras, importado_em
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, DATE_TRUNC('month', $6::DATE), $7, $8, $9, $10,
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
 * Processa lançamento completo: cliente, cobrança, classificação, status
 */
async function processarLancamento(hashUnico, evento, payment) {
  try {
    console.log(`🔄 Processando lançamento: ${hashUnico}`);

    // 1. Buscar lançamento
    const lancResult = await pool.query(`
      SELECT id, empresa, cpf_cnpj_origem, id_transacao_banco, descricao_original
      FROM bank_extratos
      WHERE hash_unico = $1
    `, [hashUnico]);

    if (lancResult.rows.length === 0) {
      console.log('⚠️ Lançamento não encontrado');
      return;
    }

    const lanc = lancResult.rows[0];
    let clienteId = null;
    let cobrancaId = null;
    let observacoes = null;

    // 2. BUSCAR CLIENTE por CPF/CNPJ
    if (lanc.cpf_cnpj_origem) {
      // Limpar CPF/CNPJ (remover pontos, traços, barras)
      const cpfCnpjLimpo = lanc.cpf_cnpj_origem.replace(/[^\d]/g, '');

      const clienteResult = await pool.query(`
        SELECT "ID", "Cliente_Nome"
        FROM "Cliente"
        WHERE "Cliente_CPF" = $1
      `, [cpfCnpjLimpo]);

      if (clienteResult.rows.length > 0) {
        clienteId = clienteResult.rows[0].ID;
        console.log(`✅ Cliente encontrado: ${clienteResult.rows[0].Cliente_Nome} (ID: ${clienteId})`);
      } else {
        console.log(`⚠️ Cliente não encontrado: ${cpfCnpjLimpo}`);
      }
    }

    // 3. BUSCAR COBRANÇA (se for PAYMENT_RECEIVED ou PIX_CREDIT_RECEIVED)
    if (['PAYMENT_RECEIVED', 'PIX_CREDIT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(evento)) {
      // Buscar pelo código Asaas
      const cobrancaResult = await pool.query(`
        SELECT "ID", "Descrição", "Valor", "Código_Cliente"
        FROM "Contas_Receber"
        WHERE "Codigo" = $1
      `, [lanc.id_transacao_banco]);

      if (cobrancaResult.rows.length > 0) {
        const cobranca = cobrancaResult.rows[0];
        cobrancaId = cobranca.ID;
        observacoes = `Cobrança: ${cobranca.Descrição || 'Sem descrição'} | Valor original: R$ ${cobranca.Valor}`;

        // Se não encontrou cliente antes, pegar da cobrança
        if (!clienteId && cobranca.Código_Cliente) {
          clienteId = cobranca.Código_Cliente;
          console.log(`✅ Cliente obtido da cobrança (ID: ${clienteId})`);
        }

        console.log(`✅ Cobrança encontrada: ID ${cobrancaId}`);
      } else {
        console.log(`⚠️ Cobrança não encontrada para código: ${lanc.id_transacao_banco}`);
        observacoes = 'Cobrança não identificada no sistema';
      }
    }

    // 4. TENTAR CLASSIFICAR AUTOMATICAMENTE
    await tentarClassificarAutomatico(hashUnico);

    // 5. VERIFICAR SE FOI CLASSIFICADO
    const classifResult = await pool.query(`
      SELECT classificacao FROM bank_extratos WHERE hash_unico = $1
    `, [hashUnico]);

    const foiClassificado = classifResult.rows[0]?.classificacao !== null;

    // 6. DEFINIR STATUS
    let status = 'PENDENTE';

    if (foiClassificado && clienteId) {
      // Classificação OK + Cliente conhecido = OK
      status = 'OK';
      console.log('✅ Status: OK (classificado + cliente conhecido)');
    } else if (!foiClassificado) {
      console.log('⚠️ Status: PENDENTE (classificação não encontrada)');
    } else if (!clienteId) {
      console.log('⚠️ Status: PENDENTE (cliente não identificado)');
    }

    // 7. ATUALIZAR BANCO
    await pool.query(`
      UPDATE bank_extratos
      SET
        cliente_id = $2,
        id_cobranca = $3,
        observacoes = $4,
        status_classificacao = $5
      WHERE hash_unico = $1
    `, [hashUnico, clienteId, cobrancaId, observacoes, status]);

    console.log(`✅ Lançamento atualizado: status=${status}, cliente=${clienteId}, cobranca=${cobrancaId}`);

    // 8. SE PENDENTE, ENVIAR WHATSAPP
    if (status === 'PENDENTE') {
      await notificarPendente(lanc, !foiClassificado, !clienteId);
    }

  } catch (err) {
    console.error('❌ Erro ao processar lançamento:', err.message);
  }
}

/**
 * Notifica grupo ADM sobre lançamento pendente
 */
async function notificarPendente(lanc, semClassificacao, semCliente) {
  try {
    const motivos = [];
    if (semClassificacao) motivos.push('❌ Classificação não encontrada');
    if (semCliente) motivos.push('❌ Cliente não identificado');

    const mensagem = `
⚠️ *LANÇAMENTO PENDENTE*

📋 *Empresa:* ${lanc.empresa}
💰 *Valor:* R$ ${Math.abs(lanc.valor).toFixed(2)}
📝 *Descrição:* ${lanc.descricao_original}
${lanc.cpf_cnpj_origem ? `👤 *CPF/CNPJ:* ${lanc.cpf_cnpj_origem}` : ''}

*Motivos:*
${motivos.join('\n')}

Use o comando *ppp* para classificar lançamentos pendentes.
    `.trim();

    console.log('📱 Enviaria WhatsApp:', mensagem);
    // TODO: Integrar com função de envio WhatsApp
    // await enviarWhatsAppGrupo('ADM', mensagem);

  } catch (err) {
    console.error('❌ Erro ao notificar pendente:', err.message);
  }
}

/**
 * Tenta classificar lançamento automaticamente usando regras
 */
async function tentarClassificarAutomatico(hashUnico) {
  try {
    // Buscar lançamento COM EMPRESA
    const lancResult = await pool.query(`
      SELECT id, empresa, descricao_original, valor, cpf_cnpj_origem
      FROM bank_extratos
      WHERE hash_unico = $1 AND classificacao IS NULL
    `, [hashUnico]);

    if (lancResult.rows.length === 0) return;

    const lanc = lancResult.rows[0];

    // Buscar regra aplicável FILTRADA POR EMPRESA
    const regraResult = await pool.query(`
      SELECT id, classificacao, confianca_base, nome_regra
      FROM bank_regras_classificacao
      WHERE ativo = true
        AND empresa = $2
        AND (
          banco_especifico IS NULL OR banco_especifico = 'Asaas'
        )
        AND (
          -- Palavras-chave (TEXT separado por vírgula)
          (palavras_chave IS NOT NULL AND $1 ~* ANY(string_to_array(palavras_chave, ',')))
          OR
          -- Regex pattern
          (regex_pattern IS NOT NULL AND $1 ~ regex_pattern)
        )
      ORDER BY prioridade DESC NULLS LAST, taxa_acerto DESC NULLS LAST
      LIMIT 1
    `, [lanc.descricao_original, lanc.empresa]);

    if (regraResult.rows.length === 0) {
      console.log(`ℹ️  Nenhuma regra encontrada para ${lanc.empresa}: "${lanc.descricao_original}"`);
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
