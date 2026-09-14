// ============================================================
// wpp/routes/banco/sicredi-sync.js — V.2609140047
// SINCRONIZAÇÃO SICREDI - POLLING MANUAL
// NOVO (14/09 00:47): Migrado para nova lógica de classificação
//   - Usa classificarLancamento() (mesma do Asaas)
//   - NÃO USA MAIS bank_regras_classificacao
//   - Usa palavras_chave + chave_aprendida das categorias
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Configuração das contas Sicredi
const CONTAS_SICREDI = [
  {
    empresa: 'ALLMAX',
    codigo_banco: '748',
    nome_banco: 'Banco Cooperativo Sicredi S.A.',
    agencia: '0101',
    conta: '12345',  // TODO: Substituir pelos dados reais
    tipo_conta: 'Corrente'
  },
  {
    empresa: 'SUMMER',
    codigo_banco: '748',
    nome_banco: 'Banco Cooperativo Sicredi S.A.',
    agencia: '0102',
    conta: '67890',  // TODO: Substituir pelos dados reais
    tipo_conta: 'Corrente'
  }
];

/**
 * Sincroniza extratos do Sicredi
 * Pode ser chamado:
 * 1. Via endpoint HTTP (manual)
 * 2. Via cron job (a cada 6 horas)
 * 3. Trigger do WhatsApp (quando houver movimento no grupo financeiro)
 */
export async function sincronizarSicredi(req, res) {
  try {
    console.log('🔄 Iniciando sincronização Sicredi...');

    const resultados = [];

    for (const conta of CONTAS_SICREDI) {
      console.log(`📊 Sincronizando ${conta.empresa} - Ag ${conta.agencia} Cc ${conta.conta}`);

      try {
        // TODO: Implementar chamada à API do Sicredi
        // Por enquanto vamos retornar estrutura vazia
        const transacoes = await buscarTransacoesSicredi(conta);

        let importados = 0;
        let duplicados = 0;

        for (const tx of transacoes) {
          const lancamento = montarLancamento(conta, tx);
          const inserido = await inserirLancamento(lancamento);

          if (inserido) {
            importados++;
            // Tentar classificar
            await tentarClassificarAutomatico(lancamento.hash_unico);
          } else {
            duplicados++;
          }
        }

        resultados.push({
          empresa: conta.empresa,
          importados,
          duplicados,
          total: transacoes.length
        });

        console.log(`✅ ${conta.empresa}: ${importados} novos, ${duplicados} duplicados`);

      } catch (err) {
        console.error(`❌ Erro ao sincronizar ${conta.empresa}:`, err.message);
        resultados.push({
          empresa: conta.empresa,
          erro: err.message
        });
      }
    }

    // Salvar log da sincronização
    await salvarLogSincronizacao('SICREDI', resultados);

    // Responder (se for chamada HTTP)
    if (res) {
      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        resultados
      });
    }

    return resultados;

  } catch (err) {
    console.error('❌ Erro geral na sincronização Sicredi:', err);
    if (res) {
      res.status(500).json({ error: err.message });
    }
    throw err;
  }
}

/**
 * Busca transações do Sicredi via API
 * TODO: Implementar quando tiver acesso à API
 */
async function buscarTransacoesSicredi(conta) {
  // Por enquanto retorna array vazio
  // Quando tiver acesso à API do Sicredi, implementar aqui

  console.log(`⚠️  API Sicredi ainda não configurada para ${conta.empresa}`);
  console.log(`   Aguardando credenciais de acesso (Client ID, Secret, Certificado)`);

  return [];

  /* EXEMPLO DE IMPLEMENTAÇÃO FUTURA:

  const token = await obterTokenSicredi(conta);

  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - 7); // Últimos 7 dias

  const response = await fetch(
    `https://openbanking.sicredi.com.br/open-banking/accounts/v1/accounts/${conta.accountId}/transactions?` +
    `fromBookingDate=${dataInicio.toISOString().split('T')[0]}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = await response.json();
  return data.data.transactions || [];
  */
}

/**
 * Monta objeto de lançamento a partir da transação do Sicredi
 */
function montarLancamento(conta, transacao) {
  const crypto = require('crypto');

  const valor = transacao.type === 'CREDIT' ?
    Math.abs(transacao.amount) :
    -Math.abs(transacao.amount);

  const lancamento = {
    empresa: conta.empresa,
    banco: 'Sicredi',
    codigo_banco: conta.codigo_banco,
    nome_banco: conta.nome_banco,
    agencia: conta.agencia,
    conta: conta.conta,
    tipo_conta: conta.tipo_conta,

    data: transacao.bookingDate || new Date().toISOString().split('T')[0],
    valor: valor,

    descricao_original: transacao.transactionInformation || transacao.description || 'Sem descrição',
    documento: transacao.transactionId || transacao.checkNumber,

    tipo: transacao.type === 'CREDIT' ? 'CREDITO' : 'DEBITO',

    cpf_cnpj_origem: transacao.debtorCpfCnpj || null,
    nome_origem: transacao.debtorName || null,
    cpf_cnpj_destino: transacao.creditorCpfCnpj || null,
    nome_destino: transacao.creditorName || null,

    id_transacao_banco: transacao.transactionId,
    tipo_importacao: 'API',

    campos_extras: JSON.stringify({
      codigo_historico: transacao.historyCode,
      complemento: transacao.complement,
      saldo_pos: transacao.balanceAfter
    })
  };

  // Hash único
  const hashString = `${lancamento.codigo_banco}-${lancamento.agencia}-${lancamento.conta}-${lancamento.data}-${Math.abs(lancamento.valor)}-${lancamento.id_transacao_banco}`;
  lancamento.hash_unico = crypto.createHash('md5').update(hashString).digest('hex');

  return lancamento;
}

/**
 * Insere lançamento no banco (retorna true se inserido, false se duplicado)
 */
async function inserirLancamento(lanc) {
  const query = `
    INSERT INTO bank_extratos (
      empresa, banco, codigo_banco, nome_banco,
      agencia, conta, tipo_conta,
      data, valor, descricao_original, documento, tipo,
      cpf_cnpj_origem, nome_origem, cpf_cnpj_destino, nome_destino,
      id_transacao_banco, tipo_importacao,
      hash_unico, campos_extras, importado_em
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18,
      $19, $20::jsonb, NOW() AT TIME ZONE 'America/Sao_Paulo'
    )
    ON CONFLICT (hash_unico) DO NOTHING
    RETURNING id
  `;

  const valores = [
    lanc.empresa, lanc.banco, lanc.codigo_banco, lanc.nome_banco,
    lanc.agencia, lanc.conta, lanc.tipo_conta,
    lanc.data, lanc.valor, lanc.descricao_original, lanc.documento, lanc.tipo,
    lanc.cpf_cnpj_origem, lanc.nome_origem, lanc.cpf_cnpj_destino, lanc.nome_destino,
    lanc.id_transacao_banco, lanc.tipo_importacao,
    lanc.hash_unico, lanc.campos_extras
  ];

  const result = await pool.query(query, valores);
  return result.rowCount > 0;
}

/**
 * Tenta classificar automaticamente usando NOVA LÓGICA
 * (mesma do Asaas: palavras_chave + chave_aprendida)
 */
async function tentarClassificarAutomatico(hashUnico) {
  try {
    // Buscar lançamento completo
    const lancResult = await pool.query(`
      SELECT
        id,
        descricao_original,
        valor,
        tipo,
        empresa,
        tipo_importacao,
        id_transacao_banco,
        cpf_cnpj_origem
      FROM bank_extratos
      WHERE hash_unico = $1 AND classificacao IS NULL
    `, [hashUnico]);

    if (lancResult.rows.length === 0) return;

    const lanc = lancResult.rows[0];

    // Usar mesma lógica de classificação do Asaas
    const { classificarLancamento } = await import('./classificacao-automatica.js');

    const resultado = await classificarLancamento({
      description: lanc.descricao_original,
      value: lanc.valor,
      tipo: lanc.tipo,
      empresa: lanc.empresa,
      tipo_importacao: lanc.tipo_importacao,
      id_transacao_banco: lanc.id_transacao_banco,
      cpfCnpjOrigem: lanc.cpf_cnpj_origem
    });

    // Se encontrou classificação automática
    if (resultado.categoria_id) {
      await pool.query(`
        UPDATE bank_extratos
        SET
          classificacao = $2,
          observacoes = $3,
          status = $4,
          classificacao_manual = false,
          classificado_por = 'Sistema - Sync Sicredi (nova lógica)',
          classificado_em = NOW() AT TIME ZONE 'America/Sao_Paulo'
        WHERE id = $1
      `, [
        lanc.id,
        resultado.categoria_id,
        resultado.observacao_padrao || '',
        resultado.status
      ]);

      console.log(`✅ Classificado (${resultado.metodo}): ${resultado.categoria_nome}`);
    }

  } catch (err) {
    console.error('❌ Erro ao classificar:', err.message);
  }
}

/**
 * Salva log da sincronização
 */
async function salvarLogSincronizacao(banco, resultados) {
  try {
    // TODO: Criar tabela de logs se necessário
    console.log(`📝 Log sincronização ${banco}:`, JSON.stringify(resultados, null, 2));
  } catch (err) {
    console.error('❌ Erro ao salvar log:', err.message);
  }
}

// ============================================================
// FIM
// ============================================================
