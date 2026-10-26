// ============================================================
// sincronizar_payment_ids_duplicados.js — V.2610261035
// Busca Payment ID correto no Asaas para cada CR duplicado
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import XLSX from 'xlsx';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ASAAS_BASE_URL = 'https://www.asaas.com/api/v3';
const IDS_DUPLICADOS = [50287, 50306, 50288, 50307, 50289, 50308, 50290, 50309];

function campoIdAsaas(empresa) {
  const map = { 6: 'Cliente_ID_tab_6', 8: 'Cliente_ID_tab_8', 9: 'Cliente_ID_tab_9' };
  return map[Number(empresa)] || 'Cliente_ID_tab_8';
}

async function buscarApiKey(empresa) {
  const { rows } = await pool.query(`
    SELECT "API_Key"
    FROM "Centros_Custos"
    WHERE "Codigo" = $1 AND "Inativo" IS NOT TRUE
    LIMIT 1
  `, [Number(empresa)]);
  return rows[0]?.API_Key || null;
}

async function buscarCustomerIdAsaas(codCliente, empresa) {
  const campoId = campoIdAsaas(empresa);
  const { rows } = await pool.query(`
    SELECT "${campoId}" as customer_id, "Cliente_Nome"
    FROM "Cliente"
    WHERE "Codigo" = $1
  `, [codCliente]);
  return rows[0] || null;
}

async function buscarPaymentAsaasPorClienteDataValor(apiKey, customerId, dueDate, valor) {
  try {
    const url = `${ASAAS_BASE_URL}/payments?customer=${customerId}&dueDate=${dueDate}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey
      }
    });

    if (!res.ok) return [];
    const data = await res.json();

    // Filtrar pelo valor exato
    const valorBuscado = parseFloat(valor).toFixed(2);
    const payments = (data.data || []).filter(p =>
      parseFloat(p.value).toFixed(2) === valorBuscado
    );

    return payments;
  } catch (error) {
    console.error(`Erro ao buscar payment: ${error.message}`);
    return [];
  }
}

(async () => {
  try {
    console.log('\n🔍 SINCRONIZAÇÃO DE PAYMENT IDS - REGISTROS DUPLICADOS\n');
    console.log('═'.repeat(150));
    console.log('\nBUSCANDO PAYMENT ID CORRETO NO ASAAS PARA CADA CR...\n');
    console.log('═'.repeat(150));

    const dados = [];

    for (const id of IDS_DUPLICADOS) {
      console.log(`\n${'─'.repeat(150)}`);
      console.log(`\n📋 CR ID: ${id}`);

      // 1. Buscar dados do CR no banco
      const { rows } = await pool.query(`
        SELECT
          cr."ID",
          cr."Codigo",
          cr."Empresa",
          cr."Centro_Custo",
          cr."Código_Cliente",
          cr."Descrição",
          cr."Valor",
          cr."Data_Vencimento",
          cr."Portador",
          cli."Cliente_Nome"
        FROM "Contas_Receber" cr
        LEFT JOIN "Cliente" cli ON cli."Codigo" = cr."Código_Cliente"
        WHERE cr."ID" = $1
      `, [id]);

      if (!rows[0]) {
        console.log('   ❌ Registro não encontrado');
        continue;
      }

      const cr = rows[0];
      const vencimento = cr.Data_Vencimento?.toISOString().split('T')[0];
      const valor = parseFloat(cr.Valor);

      console.log(`   Cliente: ${cr.Código_Cliente} - ${cr.Cliente_Nome}`);
      console.log(`   Descrição: ${cr.Descrição}`);
      console.log(`   Valor: R$ ${valor.toFixed(2)}`);
      console.log(`   Vencimento: ${vencimento}`);
      console.log(`   Payment ID no BANCO: ${cr.Portador || 'NÃO TEM'}`);

      // 2. Buscar Customer ID Asaas
      const clienteAsaas = await buscarCustomerIdAsaas(cr.Código_Cliente, cr.Centro_Custo || cr.Empresa);

      if (!clienteAsaas?.customer_id) {
        console.log(`   ⚠️  Cliente sem Customer ID Asaas`);

        dados.push({
          'CR ID': cr.ID,
          'Código CR': cr.Codigo,
          'Cliente': `${cr.Código_Cliente} - ${cr.Cliente_Nome}`,
          'Vencimento': vencimento,
          'Valor': valor,
          'Descrição': cr.Descrição,
          'Payment ID BANCO': cr.Portador || 'NÃO TEM',
          'Payment ID ASAAS': 'Cliente sem cadastro',
          'Status': '❌ SEM Customer ID',
          'Link Asaas': 'N/A',
          'Ação': 'Cadastrar cliente no Asaas'
        });
        continue;
      }

      console.log(`   Customer ID Asaas: ${clienteAsaas.customer_id}`);

      // 3. Buscar API Key
      const apiKey = await buscarApiKey(cr.Centro_Custo || cr.Empresa);

      if (!apiKey) {
        console.log(`   ⚠️  API Key não encontrada`);

        dados.push({
          'CR ID': cr.ID,
          'Código CR': cr.Codigo,
          'Cliente': `${cr.Código_Cliente} - ${cr.Cliente_Nome}`,
          'Vencimento': vencimento,
          'Valor': valor,
          'Descrição': cr.Descrição,
          'Payment ID BANCO': cr.Portador || 'NÃO TEM',
          'Payment ID ASAAS': 'Sem API Key',
          'Status': '❌ SEM API Key',
          'Link Asaas': 'N/A',
          'Ação': 'Configurar API Key'
        });
        continue;
      }

      // 4. Buscar Payment no Asaas por cliente + data + valor
      console.log(`\n   🔍 Buscando no Asaas: Cliente ${clienteAsaas.customer_id} + Data ${vencimento} + Valor R$ ${valor.toFixed(2)}...`);

      const paymentsEncontrados = await buscarPaymentAsaasPorClienteDataValor(
        apiKey,
        clienteAsaas.customer_id,
        vencimento,
        valor
      );

      if (paymentsEncontrados.length === 0) {
        console.log(`   ❌ NENHUM payment encontrado no Asaas`);

        dados.push({
          'CR ID': cr.ID,
          'Código CR': cr.Codigo,
          'Cliente': `${cr.Código_Cliente} - ${cr.Cliente_Nome}`,
          'Vencimento': vencimento,
          'Valor': valor,
          'Descrição': cr.Descrição,
          'Payment ID BANCO': cr.Portador || 'NÃO TEM',
          'Payment ID ASAAS': 'NÃO ENCONTRADO',
          'Status': '❌ SEM cobrança Asaas',
          'Link Asaas': 'N/A',
          'Ação': 'Criar cobrança no Asaas'
        });
      } else if (paymentsEncontrados.length === 1) {
        const payment = paymentsEncontrados[0];
        console.log(`   ✅ ENCONTRADO 1 payment:`);
        console.log(`      Payment ID: ${payment.id}`);
        console.log(`      Status: ${payment.status}`);
        console.log(`      Valor: R$ ${payment.value}`);
        console.log(`      Descrição: ${payment.description || 'N/A'}`);

        const paymentIdBanco = cr.Portador || '';
        const status = paymentIdBanco === payment.id
          ? '✅ CORRETO'
          : (paymentIdBanco ? '⚠️ DIFERENTE' : '⚠️ SEM Payment ID');

        console.log(`\n   ${status === '✅ CORRETO' ? '✅' : '⚠️'} Status: ${status}`);

        dados.push({
          'CR ID': cr.ID,
          'Código CR': cr.Codigo,
          'Cliente': `${cr.Código_Cliente} - ${cr.Cliente_Nome}`,
          'Vencimento': vencimento,
          'Valor': valor,
          'Descrição': cr.Descrição,
          'Payment ID BANCO': paymentIdBanco || 'NÃO TEM',
          'Payment ID ASAAS': payment.id,
          'Status': status,
          'Link Asaas': `https://www.asaas.com/payment/detail/${payment.id}`,
          'Ação': status === '✅ CORRETO' ? 'Nenhuma' : '🔧 ATUALIZAR Payment ID'
        });
      } else {
        console.log(`   ⚠️  ENCONTRADOS ${paymentsEncontrados.length} payments:`);
        paymentsEncontrados.forEach((p, idx) => {
          console.log(`      ${idx + 1}. ${p.id} - R$ ${p.value} - ${p.status} - ${p.description}`);
        });

        // Se encontrou múltiplos, listar todos
        paymentsEncontrados.forEach((payment, idx) => {
          dados.push({
            'CR ID': cr.ID,
            'Código CR': cr.Codigo,
            'Cliente': `${cr.Código_Cliente} - ${cr.Cliente_Nome}`,
            'Vencimento': vencimento,
            'Valor': valor,
            'Descrição': cr.Descrição,
            'Payment ID BANCO': cr.Portador || 'NÃO TEM',
            'Payment ID ASAAS': `${payment.id} (${idx + 1}/${paymentsEncontrados.length})`,
            'Status': `⚠️ MÚLTIPLOS (${paymentsEncontrados.length})`,
            'Link Asaas': `https://www.asaas.com/payment/detail/${payment.id}`,
            'Ação': 'Verificar qual é o correto'
          });
        });
      }

      // Aguardar entre consultas
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n\n' + '═'.repeat(150));
    console.log('\n📊 Gerando planilha Excel...\n');

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados);

    const wscols = [
      { wch: 8 },  // CR ID
      { wch: 10 }, // Código CR
      { wch: 40 }, // Cliente
      { wch: 12 }, // Vencimento
      { wch: 12 }, // Valor
      { wch: 50 }, // Descrição
      { wch: 30 }, // Payment ID BANCO
      { wch: 30 }, // Payment ID ASAAS
      { wch: 15 }, // Status
      { wch: 60 }, // Link Asaas
      { wch: 25 }  // Ação
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Sincronização Payment IDs');

    const nomeArquivo = 'Sincronizacao_Payment_IDs_Duplicados.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`✅ Planilha gerada!`);
    console.log(`📁 Arquivo: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}`);

    console.log(`\n📊 Resumo:`);
    console.log(`   Total analisado: ${IDS_DUPLICADOS.length}`);
    console.log(`   ✅ Payment ID correto: ${dados.filter(d => d.Status === '✅ CORRETO').length}`);
    console.log(`   ⚠️  Payment ID diferente: ${dados.filter(d => d.Status === '⚠️ DIFERENTE').length}`);
    console.log(`   ⚠️  Sem Payment ID: ${dados.filter(d => d.Status === '⚠️ SEM Payment ID').length}`);
    console.log(`   ❌ Sem cobrança Asaas: ${dados.filter(d => d.Status === '❌ SEM cobrança Asaas').length}`);
    console.log(`   ⚠️  Múltiplos payments: ${dados.filter(d => d.Status?.includes('MÚLTIPLOS')).length}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
