// ============================================================
// analise_critica_asaas_vs_banco.js — V.2610261030
// Análise CRÍTICA: Apenas problemas e pendências
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
const CLIENTES = [4364, 4211, 3401, 3670, 4226];
const EMPRESA = 8;

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

    const dataFim = new Date(hoje);
    dataFim.setDate(dataFim.getDate() + 30); // Incluir próximos 30 dias também

    const dataInicioStr = dataInicio.toISOString().split('T')[0];
    const dataFimStr = dataFim.toISOString().split('T')[0];

    const url = `${ASAAS_BASE_URL}/payments?customer=${customerId}&dueDate[ge]=${dataInicioStr}&dueDate[le]=${dataFimStr}&limit=100`;
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
      AND "Data_Vencimento" <= CURRENT_DATE + INTERVAL '30 days'
    ORDER BY "Data_Vencimento", "Valor"
  `, [codCliente, EMPRESA]);
  return rows;
}

function encontrarMatch(payment, crs) {
  const vencAsaas = payment.dueDate;
  const valorAsaas = parseFloat(payment.value).toFixed(2);

  let match = crs.find(cr => {
    const vencCR = cr.Data_Vencimento?.toISOString().split('T')[0];
    const valorCR = parseFloat(cr.Valor).toFixed(2);
    return vencCR === vencAsaas && valorCR === valorAsaas;
  });

  return match;
}

function vencimentoNosUltimos30Dias(dataVencimento) {
  const hoje = new Date();
  const data30DiasAtras = new Date(hoje);
  data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);

  const venc = new Date(dataVencimento);
  return venc >= data30DiasAtras && venc <= hoje;
}

(async () => {
  try {
    console.log('\n🔍 ANÁLISE CRÍTICA: Apenas Problemas e Pendências\n');
    console.log('═'.repeat(150));
    console.log('\nFILTROS APLICADOS:');
    console.log('  • Match sincronizado + PAGO: ELIMINADO');
    console.log('  • Match sincronizado + ABERTO: INCLUÍDO (⚠️ precisa atenção)');
    console.log('  • CR sem Payment Asaas (venc. últimos 30d): INCLUÍDO (❌ não enviado)');
    console.log('  • Payment Asaas sem CR + PAGO: ELIMINADO');
    console.log('  • Payment Asaas sem CR + ABERTO: INCLUÍDO (⚠️ falta CR)');
    console.log('═'.repeat(150));

    const apiKey = await buscarApiKey(EMPRESA);
    if (!apiKey) {
      throw new Error('API Key não encontrada');
    }

    const dados = [];
    let estatisticas = {
      matchPagoEliminado: 0,
      matchAbertoIncluido: 0,
      crSemPaymentIncluido: 0,
      paymentSemCrPagoEliminado: 0,
      paymentSemCrAbertoIncluido: 0
    };

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

      // 3. Relacionar
      console.log(`\n   🔗 Analisando e aplicando filtros...`);

      const crsUsados = new Set();

      for (const payment of paymentsAsaas) {
        const match = encontrarMatch(payment, crsBanco);
        const statusPago = ['RECEIVED', 'CONFIRMED'].includes(payment.status);

        if (match) {
          crsUsados.add(match.ID);

          if (statusPago) {
            // Match perfeito + PAGO = ELIMINAR
            console.log(`      ✅ ELIMINADO: Payment ${payment.id} - PAGO e sincronizado`);
            estatisticas.matchPagoEliminado++;
          } else {
            // Match perfeito + ABERTO = INCLUIR
            console.log(`      ⚠️  INCLUÍDO: Payment ${payment.id} - Match mas ABERTO`);
            estatisticas.matchAbertoIncluido++;

            const statusMatch = match.Portador === payment.id
              ? '⚠️ Sincronizado mas ABERTO'
              : '⚠️ Payment ID DIFERENTE + ABERTO';

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

              'BANCO - CR ID': match.ID,
              'BANCO - Código': match.Codigo,
              'BANCO - Valor': parseFloat(match.Valor),
              'BANCO - Payment ID': match.Portador || 'NÃO TEM',
              'BANCO - Descrição': match.Descrição,
              '   ': '',

              'Status': statusMatch,
              'Criticidade': '⚠️ ATENÇÃO'
            });
          }
        } else {
          // Payment do Asaas SEM correspondente no banco
          if (statusPago) {
            // PAGO sem CR = ELIMINAR
            console.log(`      ✅ ELIMINADO: Payment ${payment.id} - PAGO sem CR (OK)`);
            estatisticas.paymentSemCrPagoEliminado++;
          } else {
            // ABERTO sem CR = INCLUIR
            console.log(`      ❌ INCLUÍDO: Payment ${payment.id} - ABERTO sem CR`);
            estatisticas.paymentSemCrAbertoIncluido++;

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

              'Status': '❌ Payment Asaas ABERTO sem CR',
              'Criticidade': '🔴 CRÍTICO'
            });
          }
        }
      }

      // 4. CRs do banco sem Payment no Asaas (vencimento nos últimos 30 dias)
      console.log(`\n   🔗 Verificando CRs sem Payment Asaas...`);
      for (const cr of crsBanco) {
        if (!crsUsados.has(cr.ID)) {
          const vencimento = cr.Data_Vencimento?.toISOString().split('T')[0];
          const vencimentoPassado = vencimentoNosUltimos30Dias(vencimento);

          if (vencimentoPassado) {
            // Vencimento nos últimos 30 dias = INCLUIR (não foi enviado ao Asaas)
            console.log(`      ❌ INCLUÍDO: CR ${cr.ID} - Venceu nos últimos 30d sem Payment`);
            estatisticas.crSemPaymentIncluido++;

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

              'Status': '❌ CR sem Payment Asaas (venc. passado)',
              'Criticidade': '🔴 CRÍTICO'
            });
          } else {
            console.log(`      ✅ ELIMINADO: CR ${cr.ID} - Vencimento futuro (OK)`);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n\n' + '═'.repeat(150));
    console.log('\n📊 Gerando planilha Excel...\n');

    // Ordenar por criticidade, depois cliente e data
    dados.sort((a, b) => {
      if (a.Criticidade !== b.Criticidade) {
        return a.Criticidade === '🔴 CRÍTICO' ? -1 : 1;
      }
      if (a['Cliente Código'] !== b['Cliente Código']) {
        return a['Cliente Código'] - b['Cliente Código'];
      }
      return (a['Data Vencimento'] || '').localeCompare(b['Data Vencimento'] || '');
    });

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados);

    const wscols = [
      { wch: 12 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 2 },
      { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 2 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 50 }, { wch: 2 },
      { wch: 35 }, { wch: 12 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Análise Crítica');

    const nomeArquivo = 'Analise_CRITICA_Asaas_vs_Banco.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`✅ Planilha CRÍTICA gerada!`);
    console.log(`📁 Arquivo: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}`);

    console.log(`\n📊 ESTATÍSTICAS DA FILTRAGEM:`);
    console.log(`\n   ELIMINADOS (OK - não aparecem na planilha):`);
    console.log(`     ✅ Match sincronizado + PAGO: ${estatisticas.matchPagoEliminado}`);
    console.log(`     ✅ Payment sem CR + PAGO: ${estatisticas.paymentSemCrPagoEliminado}`);
    console.log(`\n   INCLUÍDOS (PROBLEMAS - aparecem na planilha):`);
    console.log(`     ⚠️  Match sincronizado + ABERTO: ${estatisticas.matchAbertoIncluido}`);
    console.log(`     🔴 CR sem Payment (venc. últimos 30d): ${estatisticas.crSemPaymentIncluido}`);
    console.log(`     🔴 Payment ABERTO sem CR: ${estatisticas.paymentSemCrAbertoIncluido}`);
    console.log(`\n   📊 TOTAL DE PROBLEMAS: ${dados.length}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
