import dotenv from 'dotenv';

dotenv.config();

// Número da fatura do OFX (CHECKNUM)
const faturaId = '717628430'; // RICARDO NUNES CAVALCANTE - R$ 348.70

const apiKey = process.env.ASAAS_API_KEY_IMOBEM;

console.log('🔍 Testando API Asaas - Buscar Cobrança\n');
console.log(`Fatura ID: ${faturaId}`);
console.log(`API Key: ${apiKey?.substring(0, 20)}...`);
console.log('');

const url = `https://www.asaas.com/api/v3/payments/${faturaId}`;

console.log(`📡 GET ${url}\n`);

try {
  const response = await fetch(url, {
    headers: {
      'access_token': apiKey
    }
  });

  console.log(`Status: ${response.status} ${response.statusText}\n`);

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Erro:', error);
  } else {
    const payment = await response.json();
    console.log('✅ Resposta da API:\n');
    console.log(JSON.stringify(payment, null, 2));

    console.log('\n\n📊 Dados relevantes para classificação:\n');
    console.log(`  ID: ${payment.id}`);
    console.log(`  Customer: ${payment.customer}`);
    console.log(`  Value: R$ ${payment.value}`);
    console.log(`  Description: ${payment.description || 'Não informado'}`);
    console.log(`  Billing Type: ${payment.billingType}`);
    console.log(`  Status: ${payment.status}`);
    console.log(`  External Reference: ${payment.externalReference || 'Não informado'}`);
    console.log(`  Invoice Number: ${payment.invoiceNumber || 'Não informado'}`);
    console.log(`  Subscription: ${payment.subscription || 'Não é assinatura'}`);
  }
} catch (err) {
  console.error('❌ Erro ao chamar API:', err.message);
}
