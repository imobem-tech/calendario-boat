// ============================================================
// gerar_excel_comparativo_asaas.js — V.2610261015
// Compara dados CR local vs Asaas API
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

async function buscarApiKey(empresa) {
  const { rows } = await pool.query(`
    SELECT "API_Key"
    FROM "Centros_Custos"
    WHERE "Codigo" = $1 AND "Inativo" IS NOT TRUE
    LIMIT 1
  `, [Number(empresa)]);
  return rows[0]?.API_Key || null;
}

async function consultarAsaas(apiKey, paymentId) {
  try {
    const url = `${ASAAS_BASE_URL}/payments/${paymentId}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey
      }
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    return null;
  }
}

async function buscarNomeClienteAsaas(apiKey, customerId) {
  try {
    const url = `${ASAAS_BASE_URL}/customers/${customerId}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.name || null;
  } catch (error) {
    return null;
  }
}

(async () => {
  try {
    console.log('\n📊 Gerando planilha comparativa CR x Asaas...\n');

    const dados = [];

    for (const id of IDS_DUPLICADOS) {
      console.log(`Processando ID ${id}...`);

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

        // 2. Buscar dados no Asaas
        let dadosAsaas = null;
        let nomeClienteAsaas = null;

        if (cr.Portador && cr.Portador.startsWith('pay_')) {
          const apiKey = await buscarApiKey(cr.Centro_Custo || cr.Empresa);

          if (apiKey) {
            dadosAsaas = await consultarAsaas(apiKey, cr.Portador);

            if (dadosAsaas && dadosAsaas.customer) {
              nomeClienteAsaas = await buscarNomeClienteAsaas(apiKey, dadosAsaas.customer);
            }

            // Aguardar 300ms entre chamadas (rate limit)
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        // 3. Montar linha comparativa
        const obs = cr.Descrição?.includes('Parlela Cota') || cr.Descrição?.includes('Parcela Cota')
          ? '🔴 RENUMERAR'
          : '🟢 MANTER';

        dados.push({
          'ID CR': cr.ID,
          'Código CR': cr.Codigo,
          'Observação': obs,
          '': '', // Separador visual

          // DADOS DO BANCO LOCAL
          'CR - Cliente Código': cr.Código_Cliente,
          'CR - Cliente Nome': cr.Cliente_Nome || 'N/A',
          'CR - Valor': parseFloat(cr.Valor),
          'CR - Vencimento': cr.Data_Vencimento?.toISOString().split('T')[0] || 'N/A',
          'CR - Descrição': cr.Descrição,
          '  ': '', // Separador visual

          // DADOS DO ASAAS (API)
          'ASAAS - Customer ID': dadosAsaas?.customer || 'N/A',
          'ASAAS - Cliente Nome': nomeClienteAsaas || 'N/A',
          'ASAAS - Valor': dadosAsaas?.value || 'N/A',
          'ASAAS - Vencimento': dadosAsaas?.dueDate || 'N/A',
          'ASAAS - Status': dadosAsaas?.status || 'N/A',
          'ASAAS - Descrição': dadosAsaas?.description || 'N/A',
          '   ': '', // Separador visual

          // COMPARAÇÃO
          'Valores Conferem?': dadosAsaas ?
            (parseFloat(cr.Valor) === parseFloat(dadosAsaas.value) ? '✅ SIM' : '❌ NÃO') :
            'N/A',
          'Payment ID': cr.Portador || 'N/A',
          'Link Asaas': cr.Portador ?
            `https://www.asaas.com/payment/detail/${cr.Portador}` :
            'N/A'
        });
      }
    }

    // Criar workbook
    const wb = XLSX.utils.book_new();

    // Criar worksheet
    const ws = XLSX.utils.json_to_sheet(dados);

    // Ajustar largura das colunas
    const wscols = [
      { wch: 8 },  // ID CR
      { wch: 10 }, // Código CR
      { wch: 12 }, // Observação
      { wch: 2 },  // Separador
      { wch: 15 }, // CR - Cliente Código
      { wch: 35 }, // CR - Cliente Nome
      { wch: 12 }, // CR - Valor
      { wch: 12 }, // CR - Vencimento
      { wch: 45 }, // CR - Descrição
      { wch: 2 },  // Separador
      { wch: 20 }, // ASAAS - Customer ID
      { wch: 35 }, // ASAAS - Cliente Nome
      { wch: 12 }, // ASAAS - Valor
      { wch: 12 }, // ASAAS - Vencimento
      { wch: 12 }, // ASAAS - Status
      { wch: 45 }, // ASAAS - Descrição
      { wch: 2 },  // Separador
      { wch: 15 }, // Valores Conferem?
      { wch: 25 }, // Payment ID
      { wch: 60 }  // Link Asaas
    ];
    ws['!cols'] = wscols;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Comparativo CR x Asaas');

    // Salvar arquivo
    const nomeArquivo = 'Comparativo_CR_Asaas_API.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`\n✅ Planilha comparativa gerada com sucesso!`);
    console.log(`📁 Arquivo: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}`);
    console.log(`\n📊 Total de registros comparados: ${dados.length}`);
    console.log(`   • Com divergência de valor: ${dados.filter(d => d['Valores Conferem?'] === '❌ NÃO').length}`);
    console.log(`   • Com valor correto: ${dados.filter(d => d['Valores Conferem?'] === '✅ SIM').length}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
