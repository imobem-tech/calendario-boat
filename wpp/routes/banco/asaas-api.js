// ============================================================
// wpp/routes/banco/asaas-api.js — V.2609132108
// FUNÇÕES PARA CONSULTAR API DO ASAAS
// Busca dados de clientes (nome, CPF/CNPJ) via customer ID
// ============================================================

/**
 * Retorna API Key do Asaas para a empresa
 */
function getAsaasApiKey(empresa) {
  const apiKeys = {
    'ALLMAX': process.env.ASAAS_API_KEY_ALLMAX,
    'IMOBEM': process.env.ASAAS_API_KEY_IMOBEM,
    'IMOBAN': process.env.ASAAS_API_KEY_IMOBAN,
    'SUMMER': process.env.ASAAS_API_KEY_SUMMER
  };

  const apiKey = apiKeys[empresa];

  if (!apiKey) {
    console.error(`❌ API Key não encontrada para empresa: ${empresa}`);
    return null;
  }

  return apiKey;
}

/**
 * Busca dados do cliente no Asaas via API
 *
 * @param {string} customerId - ID do cliente (ex: cus_000199861586)
 * @param {string} empresa - ALLMAX, IMOBEM, IMOBAN ou SUMMER
 * @returns {Object|null} { nome, cpfCnpj } ou null se erro
 */
export async function buscarDadosCliente(customerId, empresa) {
  try {
    // Validar customer ID
    if (!customerId || !customerId.startsWith('cus_')) {
      console.log(`⚠️  Customer ID inválido: ${customerId}`);
      return null;
    }

    // Obter API Key
    const apiKey = getAsaasApiKey(empresa);
    if (!apiKey) {
      return null;
    }

    console.log(`🔍 Buscando dados do cliente ${customerId} (${empresa})...`);

    // Consultar API Asaas
    const url = `https://www.asaas.com/api/v3/customers/${customerId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Erro ao buscar cliente: HTTP ${response.status}`);
      return null;
    }

    const cliente = await response.json();

    // Extrair dados
    const dadosCliente = {
      nome: cliente.name || null,
      cpfCnpj: cliente.cpfCnpj || null
    };

    console.log(`✅ Cliente encontrado: ${dadosCliente.nome} (${dadosCliente.cpfCnpj})`);

    return dadosCliente;

  } catch (err) {
    console.error(`❌ Erro ao buscar dados do cliente ${customerId}:`, err.message);
    return null;
  }
}

/**
 * Formata CPF/CNPJ
 * CPF: 000.000.000-00
 * CNPJ: 00.000.000/0000-00
 */
export function formatarCpfCnpj(cpfCnpj) {
  if (!cpfCnpj) return null;

  // Remover caracteres não numéricos
  const numeros = cpfCnpj.replace(/\D/g, '');

  if (numeros.length === 11) {
    // CPF
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (numeros.length === 14) {
    // CNPJ
    return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  // Retornar sem formatação se tamanho inválido
  return cpfCnpj;
}

// ============================================================
// FIM
// ============================================================
