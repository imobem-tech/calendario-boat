// ============================================================
// buscar_payments_asaas_por_cliente_data.js — V.2610261020
// Busca no Asaas todas as cobranças de cada cliente/data
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

// Mapeia empresa → campo ID do Cliente
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
    SELECT "${campoId}" as customer_id
    FROM "Cliente"
    WHERE "Codigo" = $1
  `, [codCliente]);
  return rows[0]?.customer_id || null;
}

async function buscarPaymentsAsaasPorClienteData(apiKey, customerId, dueDate) {
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
    return data.data || [];
  } catch (error) {
    console.error(`Erro ao buscar payments: ${error.message}`);
    return [];
  }
}

(async () => {
  try {
    console.log('\n🔍 BUSCANDO PAYMENTS NO ASAAS POR CLIENTE/DATA\n');
    console.log('═'.repeat(150));

    const dados = [];

    for (const id of IDS_DUPLICADOS) {
      console.log(`\nProcessando ID ${id}...`);

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

      if (rows[0]) {
        const cr = rows[0];
        const vencimento = cr.Data_Vencimento?.toISOString().split('T')[0];

        console.log(`   Cliente: ${cr.Código_Cliente} - ${cr.Cliente_Nome}`);
        console.log(`   Vencimento: ${vencimento}`);
        console.log(`   Payment ID no banco: ${cr.Portador || 'NÃO TEM'}`);

        // 2. Buscar Customer ID do Asaas
        const customerId = await buscarCustomerIdAsaas(cr.Código_Cliente, cr.Centro_Custo || cr.Empresa);

        if (!customerId) {
          console.log(`   ⚠️  Cliente sem Customer ID Asaas cadastrado`);

          dados.push({
            'ID CR': cr.ID,
            'Código CR': cr.Codigo,
            'Cliente Código': cr.Código_Cliente,
            'Cliente Nome': cr.Cliente_Nome || 'N/A',
            'Vencimento': vencimento,
            'Valor CR': parseFloat(cr.Valor),
            'Payment ID no Banco': cr.Portador || 'NÃO TEM',
            'Customer ID Asaas': 'NÃO CADASTRADO',
            'Payments Encontrados': 0,
            'Payment IDs no Asaas': 'N/A',
            'Valores no Asaas': 'N/A',
            'Status': 'Cliente sem cadastro Asaas'
          });
          continue;
        }

        console.log(`   Customer ID Asaas: ${customerId}`);

        // 3. Buscar API Key
        const apiKey = await buscarApiKey(cr.Centro_Custo || cr.Empresa);

        if (!apiKey) {
          console.log(`   ⚠️  API Key não encontrada`);

          dados.push({
            'ID CR': cr.ID,
            'Código CR': cr.Codigo,
            'Cliente Código': cr.Código_Cliente,
            'Cliente Nome': cr.Cliente_Nome || 'N/A',
            'Vencimento': vencimento,
            'Valor CR': parseFloat(cr.Valor),
            'Payment ID no Banco': cr.Portador || 'NÃO TEM',
            'Customer ID Asaas': customerId,
            'Payments Encontrados': 0,
            'Payment IDs no Asaas': 'N/A',
            'Valores no Asaas': 'N/A',
            'Status': 'API Key não encontrada'
          });
          continue;
        }

        // 4. Buscar TODAS as cobranças deste cliente nesta data no Asaas
        console.log(`   🔍 Buscando payments no Asaas...`);
        const payments = await buscarPaymentsAsaasPorClienteData(apiKey, customerId, vencimento);

        console.log(`   ✅ Encontrados: ${payments.length} payment(s)`);

        if (payments.length === 0) {
          console.log(`   ⚠️  Nenhuma cobrança encontrada no Asaas para este cliente/data`);

          dados.push({
            'ID CR': cr.ID,
            'Código CR': cr.Codigo,
            'Cliente Código': cr.Código_Cliente,
            'Cliente Nome': cr.Cliente_Nome || 'N/A',
            'Vencimento': vencimento,
            'Valor CR': parseFloat(cr.Valor),
            'Payment ID no Banco': cr.Portador || 'NÃO TEM',
            'Customer ID Asaas': customerId,
            'Payments Encontrados': 0,
            'Payment IDs no Asaas': 'NENHUM',
            'Valores no Asaas': 'NENHUM',
            'Status': '❌ SEM cobrança no Asaas'
          });
        } else {
          // Listar todos os payments encontrados
          payments.forEach((payment, idx) => {
            console.log(`      ${idx + 1}. Payment ID: ${payment.id}`);
            console.log(`         Valor: R$ ${payment.value}`);
            console.log(`         Status: ${payment.status}`);
            console.log(`         Descrição: ${payment.description || 'N/A'}`);
          });

          // Verificar se o Payment ID do banco está entre os encontrados
          const paymentIdNoBanco = cr.Portador;
          const encontrouPaymentId = payments.find(p => p.id === paymentIdNoBanco);

          const paymentIds = payments.map(p => p.id).join(', ');
          const valores = payments.map(p => `R$ ${p.value}`).join(', ');

          let status;
          if (!paymentIdNoBanco) {
            status = '⚠️ Banco SEM Payment ID';
          } else if (encontrouPaymentId) {
            status = '✅ Payment ID CORRETO';
          } else {
            status = '❌ Payment ID ERRADO';
          }

          dados.push({
            'ID CR': cr.ID,
            'Código CR': cr.Codigo,
            'Cliente Código': cr.Código_Cliente,
            'Cliente Nome': cr.Cliente_Nome || 'N/A',
            'Vencimento': vencimento,
            'Valor CR': parseFloat(cr.Valor),
            'Payment ID no Banco': paymentIdNoBanco || 'NÃO TEM',
            'Customer ID Asaas': customerId,
            'Payments Encontrados': payments.length,
            'Payment IDs no Asaas': paymentIds,
            'Valores no Asaas': valores,
            'Status': status
          });
        }

        // Aguardar 500ms entre chamadas (rate limit)
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n\n' + '═'.repeat(150));
    console.log('\n📊 Gerando planilha Excel...\n');

    // Criar workbook
    const wb = XLSX.utils.book_new();

    // Criar worksheet
    const ws = XLSX.utils.json_to_sheet(dados);

    // Ajustar largura das colunas
    const wscols = [
      { wch: 8 },  // ID CR
      { wch: 10 }, // Código CR
      { wch: 12 }, // Cliente Código
      { wch: 35 }, // Cliente Nome
      { wch: 12 }, // Vencimento
      { wch: 12 }, // Valor CR
      { wch: 30 }, // Payment ID no Banco
      { wch: 25 }, // Customer ID Asaas
      { wch: 10 }, // Payments Encontrados
      { wch: 60 }, // Payment IDs no Asaas
      { wch: 30 }, // Valores no Asaas
      { wch: 25 }  // Status
    ];
    ws['!cols'] = wscols;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Payments Asaas por Cliente');

    // Salvar arquivo
    const nomeArquivo = 'Busca_Payments_Asaas_ClienteData.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`✅ Planilha gerada com sucesso!`);
    console.log(`📁 Arquivo: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}`);
    console.log(`\n📊 Resumo:`);
    console.log(`   Total analisado: ${dados.length}`);
    console.log(`   ✅ Payment ID correto: ${dados.filter(d => d.Status === '✅ Payment ID CORRETO').length}`);
    console.log(`   ❌ Payment ID errado: ${dados.filter(d => d.Status === '❌ Payment ID ERRADO').length}`);
    console.log(`   ⚠️  Sem Payment ID: ${dados.filter(d => d.Status === '⚠️ Banco SEM Payment ID').length}`);
    console.log(`   ❌ Sem cobrança Asaas: ${dados.filter(d => d.Status === '❌ SEM cobrança no Asaas').length}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
