// ============================================================
// wpp/routes/banco/asaas-webhook.js — V.2609122114
// WEBHOOK ASAAS - RECEBE EVENTOS EM TEMPO REAL
// SUPORTE A MÚLTIPLAS CONTAS ASAAS (parâmetro ?empresa=)
// CLASSIFICAÇÃO AUTOMÁTICA EM 3 PRIORIDADES
// STATUS: SEMPRE PENDENTE ATÉ ANEXAR RECIBO
// ACEITA: payment, transfer, bill, movement (extrato bancário)
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;
import { classificarLancamento } from './classificacao-automatica.js';

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

    // Validar estrutura mínima do evento (apenas 'event' é obrigatório)
    if (!evento.event) {
      console.error('❌ Evento sem campo "event"');
      return res.status(400).json({ error: 'Evento inválido: campo "event" ausente' });
    }

    const event = evento.event;

    // Extrair dados do objeto (pode ser payment, transfer, bill, movement, etc)
    const dadosEvento = evento.payment || evento.transfer || evento.bill || evento.movement || evento.pix || {};

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
    console.log(`📊 Dados do evento:`, JSON.stringify(dadosEvento, null, 2));

    // Validar se há dados
    if (!dadosEvento.id && !dadosEvento.value) {
      console.error('❌ Webhook sem dados válidos (sem id ou value)');
      console.error('   Event:', event);
      console.error('   Body completo:', JSON.stringify(evento, null, 2));
      return res.status(400).json({
        error: 'Dados inválidos',
        event: event,
        help: 'Webhook deve conter payment, transfer, bill, movement ou pix com id e value'
      });
    }

    // Extrair dados do lançamento (compatível com múltiplas estruturas)
    const lancamento = {
      empresa: empresa,
      banco: 'Asaas',
      codigo_banco: '461', // Código Asaas no BACEN
      nome_banco: 'Asaas IP S.A.',
      tipo_conta: 'Corrente',

      data: dadosEvento.paymentDate || dadosEvento.date || dadosEvento.dateCreated?.split('T')[0] || new Date().toISOString().split('T')[0],
      valor: event === 'TRANSFER_CREATED' ? -Math.abs(dadosEvento.value) : (dadosEvento.value || 0),

      descricao_original: dadosEvento.description || `${event} - ${dadosEvento.billingType || 'N/A'}`,
      documento: dadosEvento.invoiceNumber || dadosEvento.id || 'N/A',

      tipo: (dadosEvento.value || 0) > 0 ? 'CREDITO' : 'DEBITO',

      // Dados específicos
      cpf_cnpj_origem: dadosEvento.customer || dadosEvento.cpfCnpj || null,
      id_transacao_banco: dadosEvento.id || dadosEvento.transactionId || `${event}-${Date.now()}`,
      tipo_importacao: 'WEBHOOK',

      // Campos extras em JSONB
      campos_extras: JSON.stringify({
        evento: event,
        forma_pagamento: dadosEvento.billingType || dadosEvento.type || 'N/A',
        taxa: (dadosEvento.value || 0) - (dadosEvento.netValue || dadosEvento.value || 0),
        valor_liquido: dadosEvento.netValue || dadosEvento.value || 0,
        status: dadosEvento.status || 'N/A',
        invoice_url: dadosEvento.invoiceUrl || null,
        bank_slip_url: dadosEvento.bankSlipUrl || null,
        nosso_numero: dadosEvento.nossoNumero || null,
        dados_completos: dadosEvento
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
 * Tenta classificar lançamento automaticamente
 * NOVA LÓGICA:
 *   - Cobrança Asaas → palavras_chave → PENDENTE
 *   - Outros → chave_aprendida → OK
 */
async function tentarClassificarAutomatico(hashUnico) {
  try {
    // Buscar lançamento
    const lancResult = await pool.query(`
      SELECT
        id,
        empresa,
        descricao_original,
        valor,
        tipo,
        id_transacao_banco,
        tipo_importacao
      FROM bank_extratos
      WHERE hash_unico = $1 AND classificacao IS NULL
    `, [hashUnico]);

    if (lancResult.rows.length === 0) return;

    const lanc = lancResult.rows[0];

    // Classificar usando novo sistema
    const resultado = await classificarLancamento({
      description: lanc.descricao_original,
      value: lanc.valor,
      tipo: lanc.tipo,
      empresa: lanc.empresa,
      tipo_importacao: lanc.tipo_importacao,
      id_transacao_banco: lanc.id_transacao_banco
    });

    // Se encontrou classificação
    if (resultado.categoria_id) {
      // Montar query de atualização
      let updateQuery = `
        UPDATE bank_extratos
        SET
          classificacao = $2,
          status = $3,
          classificacao_manual = false,
          classificado_por = $4,
          classificado_em = NOW()
      `;

      let updateValues = [
        lanc.id,
        resultado.categoria_id,
        resultado.status,  // 'PENDENTE' ou 'OK'
        `Sistema - ${resultado.metodo}`
      ];

      // Se tem observação padrão (chave aprendida)
      if (resultado.observacao_padrao) {
        updateQuery += `, observacao = $5`;
        updateValues.push(resultado.observacao_padrao);
      }

      updateQuery += ` WHERE id = $1`;

      await pool.query(updateQuery, updateValues);

      console.log(`✅ Classificado: ${resultado.categoria_nome} (${resultado.metodo})`);
      console.log(`   Status: ${resultado.status}`);
      if (resultado.observacao_padrao) {
        console.log(`   Observação: ${resultado.observacao_padrao}`);
      }

    } else {
      console.log(`ℹ️  Nenhuma regra encontrada para: "${lanc.descricao_original}"`);

      // Marcar como PENDENTE mesmo sem classificação
      await pool.query(`
        UPDATE bank_extratos
        SET status = 'PENDENTE'
        WHERE id = $1 AND status IS NULL
      `, [lanc.id]);
    }

  } catch (err) {
    console.error('❌ Erro ao classificar automaticamente:', err.message);
  }
}

// ============================================================
// FIM
// ============================================================
