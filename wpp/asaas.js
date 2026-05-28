// ============================================================
// wpp/asaas.js — V.2605281955
// Allmax Gestão de Cotas — Marujo⚓
// Módulo universal de integração com Asaas
//
// Exporta:
//   buscarApiKey(pool, empresa)
//   buscarOuCriarCliente(pool, apiKey, empresa, codCliente)
//   criarCobranca(apiKey, customerId, dados)
//   gravarRetornoCobranca(pool, codigo, paymentId, linkBoleto, linhaDigitavel)
//   inserirContasReceber(pool, dados)
//   gerarCobrancaCompleta(pool, empresa, codCliente, dadosCobranca)
// ============================================================

const ASAAS_BASE_URL = 'https://www.asaas.com/api/v3'

// ============================================================
// HELPERS
// ============================================================

function limparCpfCnpj(v) {
  return String(v || '').replace(/[.\-\/]/g, '')
}

function limparTelefone(v) {
  return String(v || '').replace('+55', '').replace(/\s/g, '').trim()
}

// Mapeia empresa → campo ID no Cliente
function campoIdAsaas(empresa) {
  const map = { 6: 'Cliente_ID_tab_6', 8: 'Cliente_ID_tab_8', 9: 'Cliente_ID_tab_9' }
  return map[Number(empresa)] || 'Cliente_ID_tab_8'
}

async function httpAsaas(method, path, apiKey, body = null) {
  const url = `${ASAAS_BASE_URL}${path}`
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey
    }
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)
  const data = await res.json()

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Asaas HTTP ${res.status} em ${method} ${path}: ${JSON.stringify(data)}`)
  }
  return data
}

// ============================================================
// 1. BUSCAR API KEY
// ============================================================

export async function buscarApiKey(pool, empresa) {
  const { rows } = await pool.query(`
    SELECT "API_Key"
      FROM public."Centros_Custos"
     WHERE "Codigo" = $1
       AND "Inativo" IS NOT TRUE
     LIMIT 1
  `, [Number(empresa)])

  if (!rows[0]?.API_Key) {
    throw new Error(`API Key não encontrada para empresa ${empresa}`)
  }
  return rows[0].API_Key
}

// ============================================================
// 2. BUSCAR DADOS DO CLIENTE NO BANCO
// ============================================================

export async function buscarDadosCliente(pool, codCliente) {
  const { rows } = await pool.query(`
    SELECT "Codigo",
           "Cliente_Nome",
           "Cliente_CPF",
           "Cliente_Telefone_Celular",
           "Outros_Email",
           "Cliente_ID_tab_6",
           "Cliente_ID_tab_8",
           "Cliente_ID_tab_9"
      FROM public."Cliente"
     WHERE "Codigo" = $1
     LIMIT 1
  `, [Number(codCliente)])

  if (!rows[0]) throw new Error(`Cliente ${codCliente} não encontrado`)
  return rows[0]
}

// ============================================================
// 3. CRIAR OU ATUALIZAR CLIENTE NO ASAAS
// ============================================================

export async function buscarOuCriarCliente(pool, apiKey, empresa, codCliente) {
  const cli = await buscarDadosCliente(pool, codCliente)
  const campoId = campoIdAsaas(empresa)
  const customerId = cli[campoId] || ''

  const payload = {
    name: cli.Cliente_Nome,
    email: cli.Outros_Email || '',
    cpfCnpj: limparCpfCnpj(cli.Cliente_CPF),
    mobilePhone: limparTelefone(cli.Cliente_Telefone_Celular),
    externalReference: String(codCliente),
    notificationDisabled: false
  }

  let resp
  if (customerId) {
    resp = await httpAsaas('PUT', `/customers/${customerId}`, apiKey, payload)
  } else {
    resp = await httpAsaas('POST', '/customers', apiKey, payload)
    // Grava o ID retornado pelo Asaas no banco
    await pool.query(`
      UPDATE public."Cliente"
         SET "${campoId}" = $1
       WHERE "Codigo" = $2
    `, [resp.id, codCliente])
    console.log(`[ASAAS] Cliente criado: ${resp.id} → Cliente ${codCliente}`)
  }

  return resp.id
}

// ============================================================
// 4. CRIAR COBRANÇA NO ASAAS
// ============================================================

export async function criarCobranca(apiKey, customerId, dados) {
  // dados: { valor, vencimento (Date), descricao, externalReference }
  const payload = {
    customer: customerId,
    billingType: 'BOLETO',
    value: Number(dados.valor),
    dueDate: dados.vencimento instanceof Date
      ? dados.vencimento.toISOString().split('T')[0]
      : dados.vencimento,
    description: dados.descricao,
    externalReference: String(dados.externalReference),
    fine: { value: 2 },
    interest: { value: 2.99 },
    notifyCustomer: true,
    notifyWhatsApp: true
  }

  const resp = await httpAsaas('POST', '/payments', apiKey, payload)
  return {
    paymentId: resp.id,
    linkBoleto: resp.invoiceUrl || '',
    linhaDigitavel: resp.bankSlipDigitableLine || ''
  }
}

// ============================================================
// 5. INSERIR NA CONTAS_RECEBER
// ============================================================

export async function inserirContasReceber(pool, dados) {
  // dados: { empresa, descricao, codCliente, valor, vencimento, centroCusto }
  const { rows } = await pool.query(`
    SELECT COALESCE(MAX("Codigo"), 0) + 1 AS proximo
      FROM public."Contas_Receber"
     WHERE "Empresa" = $1
  `, [Number(dados.empresa)])

  const codigo = rows[0].proximo

  await pool.query(`
    INSERT INTO public."Contas_Receber"
      ("Empresa", "Codigo", "Documento", "Descrição", "Código_Cliente",
       "Data_Conta", "Data_Vencimento", "Valor", "Centro_Custo")
    VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
  `, [
    Number(dados.empresa),
    codigo,
    String(codigo),
    dados.descricao,
    Number(dados.codCliente),
    dados.vencimento instanceof Date ? dados.vencimento : new Date(dados.vencimento),
    Number(dados.valor),
    String(dados.centroCusto)
  ])

  return codigo
}

// ============================================================
// 6. GRAVAR RETORNO DO ASAAS NA CONTAS_RECEBER
// ============================================================

export async function gravarRetornoCobranca(pool, codigo, empresa, paymentId, linkBoleto, linhaDigitavel) {
  await pool.query(`
    UPDATE public."Contas_Receber"
       SET "Portador"               = $1,
           "agendamento_obs"        = $2,
           "Boleto_Linha_Digitável" = $3
     WHERE "Codigo"  = $4
       AND "Empresa" = $5
  `, [paymentId, linkBoleto, linhaDigitavel, codigo, Number(empresa)])
}

// ============================================================
// 7. FLUXO COMPLETO — inserir CR + Asaas
// ============================================================

export async function gerarCobrancaCompleta(pool, empresa, codCliente, dadosCobranca) {
  // dadosCobranca: { valor, descricao, vencimento, centroCusto }

  const apiKey = await buscarApiKey(pool, empresa)

  // Inserir na Contas_Receber
  const codigo = await inserirContasReceber(pool, {
    empresa,
    descricao: dadosCobranca.descricao,
    codCliente,
    valor: dadosCobranca.valor,
    vencimento: dadosCobranca.vencimento,
    centroCusto: dadosCobranca.centroCusto
  })

  // Criar ou atualizar cliente no Asaas
  const customerId = await buscarOuCriarCliente(pool, apiKey, empresa, codCliente)

  // Criar cobrança no Asaas
  const { paymentId, linkBoleto, linhaDigitavel } = await criarCobranca(apiKey, customerId, {
    valor: dadosCobranca.valor,
    vencimento: dadosCobranca.vencimento,
    descricao: dadosCobranca.descricao,
    externalReference: codigo
  })

  // Gravar retorno na CR
  await gravarRetornoCobranca(pool, codigo, empresa, paymentId, linkBoleto, linhaDigitavel)

  console.log(`[ASAAS] Cobrança gerada: CR=${codigo} | Payment=${paymentId}`)

  return { codigo, paymentId, linkBoleto, linhaDigitavel }
}
