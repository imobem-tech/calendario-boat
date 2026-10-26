// ============================================================
// analise_completa_asaas_vs_banco.js — V.2610261025
// Análise completa: Asaas vs Banco (últimos 30 dias)
// Relaciona por cliente + data + valor
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

// Clientes dos registros duplicados
const CLIENTES = [4364, 4211, 3401, 3670, 4226];
const EMPRESA = 8; // ALLMAX

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

async function buscarDadosCliente(codCliente) {
  const campoId = campoIdAsaas(EMPRESA);
  const { rows } = await pool.query(`
    SELECT "Codigo", "Cliente_Nome", "${campoId}" as customer_id
    FROM "Cliente"
    WHERE "Codigo" = $1
  `, [codCliente]);
  return rows[0] || null;
}

async function buscarPaymentsAsaasUltimos30Dias(apiKey, customerId) {
  try {
    const hoje = new Date();
    const dataInicio = new Date(hoje);
    dataInicio.setDate(dataInicio.getDate() - 30);

    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    const url = `${ASAAS_BASE_URL}/payments?customer=${customerId}&dateCreated[ge]=${dataInicioStr}&limit=100`;
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

async function buscarCRsUltimos30Dias(codCliente) {
  const { rows } = await pool.query(`
    SELECT
      "ID",
      "Codigo",
      "Empresa",
      "Código_Cliente",
      "Descrição",
      "Valor",
      "Data_Vencimento",
      "Portador"
    FROM "Contas_Receber"
    WHERE "Código_Cliente" = $1
      AND "Empresa" = $2
      AND "Data_Vencimento" >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY "Data_Vencimento", "Valor"
  `, [codCliente, EMPRESA]);
  return rows;
}

function encontrarMatch(payment, crs) {
  const vencAsaas = payment.dueDate;
  const valorAsaas = parseFloat(payment.value).toFixed(2);

  // Tentar match exato: data + valor
  let match = crs.find(cr => {
    const vencCR = cr.Data_Vencimento?.toISOString().split('T')[0];
    const valorCR = parseFloat(cr.Valor).toFixed(2);
    return vencCR === vencAsaas && valorCR === valorAsaas;
  });

  return match;
}

(async () => {
  try {
    console.log('\n📊 ANÁLISE COMPLETA: ASAAS vs BANCO (Últimos 30 dias)\n');
    console.log('═'.repeat(150));

    const apiKey = await buscarApiKey(EMPRESA);
    if (!apiKey) {
      throw new Error('API Key não encontrada');
    }

    const dados = [];

    for (const codCliente of CLIENTES) {
      console.log(`\n${'─'.repeat(150)}`);
      console.log(`\n🔍 Processando Cliente: ${codCliente}`);

      const cliente = await buscarDadosCliente(codCliente);
      if (!cliente) {
        console.log(`   ⚠️  Cliente não encontrado no banco`);
        continue;
      }

      console.log(`   Nome: ${cliente.Cliente_Nome}`);
      console.log(`   Customer ID Asaas: ${cliente.customer_id || 'NÃO CADASTRADO'}`);

      if (!cliente.customer_id) {
        console.log(`   ⏭️  Pulando (sem Customer ID Asaas)`);
        continue;
      }

      // 1. Buscar payments no Asaas
      console.log(`\n   📥 Buscando payments no Asaas...`);
      const paymentsAsaas = await buscarPaymentsAsaasUltimos30Dias(apiKey, cliente.customer_id);
      console.log(`   ✅ Encontrados: ${paymentsAsaas.length} payment(s)`);

      // 2. Buscar CRs no banco
      console.log(`\n   📥 Buscando CRs no banco...`);
      const crsBanco = await buscarCRsUltimos30Dias(codCliente);
      console.log(`   ✅ Encontrados: ${crsBanco.length} CR(s)`);

      // 3. Relacionar cada payment do Asaas com CR do banco
      console.log(`\n   🔗 Relacionando Asaas → Banco...`);

      const crsUsados = new Set();

      for (const payment of paymentsAsaas) {
        const match = encontrarMatch(payment, crsBanco);

        if (match) {
          crsUsados.add(match.ID);

          const statusMatch = match.Portador === payment.id
            ? '✅ MATCH PERFEITO'
            : (match.Portador ? '⚠️ Payment ID DIFERENTE' : '⚠️ SEM Payment ID');

          dados.push({
            'Cliente Código': codCliente,
            'Cliente Nome': cliente.Cliente_Nome,
            'Data Vencimento': payment.dueDate,
            'Valor': parseFloat(payment.value),
            '': '', // Separador

            // ASAAS
            'ASAAS - Payment ID': payment.id,
            'ASAAS - Valor': parseFloat(payment.value),
            'ASAAS - Status': payment.status,
            'ASAAS - Descrição': payment.description || 'N/A',
            '  ': '', // Separador

            // BANCO
            'BANCO - CR ID': match.ID,
            'BANCO - Código': match.Codigo,
            'BANCO - Valor': parseFloat(match.Valor),
            'BANCO - Payment ID': match.Portador || 'NÃO TEM',
            'BANCO - Descrição': match.Descrição,
            '   ': '', // Separador

            // STATUS
            'Status': statusMatch
          });
        } else {
          // Payment do Asaas SEM correspondente no banco
          dados.push({
            'Cliente Código': codCliente,
            'Cliente Nome': cliente.Cliente_Nome,
            'Data Vencimento': payment.dueDate,
            'Valor': parseFloat(payment.value),
            '': '',

            'ASAAS - Payment ID': payment.id,
            'ASAAS - Valor': parseFloat(payment.value),
            'ASAAS - Status': payment.status,
            'ASAAS - Descrição': payment.description || 'N/A',
            '  ': '',

            'BANCO - CR ID': 'NÃO TEM',
            'BANCO - Código': 'N/A',
            'BANCO - Valor': 'N/A',
            'BANCO - Payment ID': 'N/A',
            'BANCO - Descrição': 'N/A',
            '   ': '',

            'Status': '❌ SEM CR no Banco'
          });
        }
      }

      // 4. CRs do banco que NÃO têm correspondente no Asaas
      console.log(`\n   🔗 Verificando CRs sem match no Asaas...`);
      for (const cr of crsBanco) {
        if (!crsUsados.has(cr.ID)) {
          const vencimento = cr.Data_Vencimento?.toISOString().split('T')[0];

          dados.push({
            'Cliente Código': codCliente,
            'Cliente Nome': cliente.Cliente_Nome,
            'Data Vencimento': vencimento,
            'Valor': parseFloat(cr.Valor),
            '': '',

            'ASAAS - Payment ID': 'NÃO TEM',
            'ASAAS - Valor': 'N/A',
            'ASAAS - Status': 'N/A',
            'ASAAS - Descrição': 'N/A',
            '  ': '',

            'BANCO - CR ID': cr.ID,
            'BANCO - Código': cr.Codigo,
            'BANCO - Valor': parseFloat(cr.Valor),
            'BANCO - Payment ID': cr.Portador || 'NÃO TEM',
            'BANCO - Descrição': cr.Descrição,
            '   ': '',

            'Status': '❌ SEM Payment no Asaas'
          });
        }
      }

      // Aguardar entre clientes
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n\n' + '═'.repeat(150));
    console.log('\n📊 Gerando planilha Excel...\n');

    // Ordenar por cliente e data
    dados.sort((a, b) => {
      if (a['Cliente Código'] !== b['Cliente Código']) {
        return a['Cliente Código'] - b['Cliente Código'];
      }
      return (a['Data Vencimento'] || '').localeCompare(b['Data Vencimento'] || '');
    });

    // Criar workbook
    const wb = XLSX.utils.book_new();

    // Criar worksheet
    const ws = XLSX.utils.json_to_sheet(dados);

    // Ajustar largura das colunas
    const wscols = [
      { wch: 12 }, // Cliente Código
      { wch: 35 }, // Cliente Nome
      { wch: 12 }, // Data Vencimento
      { wch: 12 }, // Valor
      { wch: 2 },  // Separador
      { wch: 30 }, // ASAAS - Payment ID
      { wch: 12 }, // ASAAS - Valor
      { wch: 12 }, // ASAAS - Status
      { wch: 50 }, // ASAAS - Descrição
      { wch: 2 },  // Separador
      { wch: 10 }, // BANCO - CR ID
      { wch: 12 }, // BANCO - Código
      { wch: 12 }, // BANCO - Valor
      { wch: 30 }, // BANCO - Payment ID
      { wch: 50 }, // BANCO - Descrição
      { wch: 2 },  // Separador
      { wch: 25 }  // Status
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Análise Asaas vs Banco');

    // Salvar arquivo
    const nomeArquivo = 'Analise_Completa_Asaas_vs_Banco.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`✅ Planilha gerada com sucesso!`);
    console.log(`📁 Arquivo: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}`);

    console.log(`\n📊 Estatísticas:`);
    console.log(`   Total de linhas: ${dados.length}`);
    console.log(`   ✅ Match perfeito: ${dados.filter(d => d.Status === '✅ MATCH PERFEITO').length}`);
    console.log(`   ⚠️  Payment ID diferente: ${dados.filter(d => d.Status === '⚠️ Payment ID DIFERENTE').length}`);
    console.log(`   ⚠️  Sem Payment ID: ${dados.filter(d => d.Status === '⚠️ SEM Payment ID').length}`);
    console.log(`   ❌ Sem CR no banco: ${dados.filter(d => d.Status === '❌ SEM CR no Banco').length}`);
    console.log(`   ❌ Sem Payment Asaas: ${dados.filter(d => d.Status === '❌ SEM Payment no Asaas').length}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
