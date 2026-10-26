// ============================================================
// gerar_planilha_correcao_4_registros.js — V.2610261040
// Planilha com apenas os 4 registros que precisam correção
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import XLSX from 'xlsx';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// IDs problemáticos
const IDS_PROBLEMATICOS = [50287, 50288, 50289, 50290];

// Payment IDs corretos encontrados no Asaas
const PAYMENT_IDS_CORRETOS = {
  50287: 'pay_eug5x61vumkvqyu3',
  50288: 'pay_eug5x61vumkvqyu3',
  50289: 'pay_eug5x61vumkvqyu3',
  50290: 'NÃO TEM NO ASAAS'
};

(async () => {
  try {
    console.log('\n📋 GERANDO PLANILHA DE CORREÇÃO (4 registros)\n');
    console.log('═'.repeat(100));

    const dados = [];

    for (const id of IDS_PROBLEMATICOS) {
      console.log(`\nProcessando CR ID: ${id}...`);

      const { rows } = await pool.query(`
        SELECT
          cr."ID",
          cr."Codigo",
          cr."Empresa",
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
        const paymentIdCorreto = PAYMENT_IDS_CORRETOS[id];

        console.log(`   ✅ Cliente: ${cr.Código_Cliente} - ${cr.Cliente_Nome}`);
        console.log(`   ✅ Valor: R$ ${parseFloat(cr.Valor).toFixed(2)}`);
        console.log(`   ✅ Payment ID Banco: ${cr.Portador || 'NÃO TEM'}`);
        console.log(`   ✅ Payment ID Asaas: ${paymentIdCorreto}`);

        dados.push({
          'ID CR': cr.ID,
          'Código CR': cr.Codigo,
          'Empresa': cr.Empresa,
          'Cliente Código': cr.Código_Cliente,
          'Cliente Nome': cr.Cliente_Nome || 'N/A',
          'Descrição': cr.Descrição,
          'Valor': parseFloat(cr.Valor),
          'Data Vencimento': vencimento,
          'Payment ID BANCO': cr.Portador || 'NÃO TEM',
          'Payment ID ASAAS (Correto)': paymentIdCorreto,
          'Status': paymentIdCorreto === 'NÃO TEM NO ASAAS' ? '❌ SEM COBRANÇA' : '⚠️ ATUALIZAR',
          'Link Asaas': paymentIdCorreto === 'NÃO TEM NO ASAAS'
            ? 'N/A'
            : `https://www.asaas.com/payment/detail/${paymentIdCorreto}`
        });
      }
    }

    console.log('\n\n' + '═'.repeat(100));
    console.log('\n📊 Gerando Excel...\n');

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados);

    // Ajustar largura das colunas
    const wscols = [
      { wch: 8 },  // ID CR
      { wch: 10 }, // Código CR
      { wch: 8 },  // Empresa
      { wch: 12 }, // Cliente Código
      { wch: 35 }, // Cliente Nome
      { wch: 45 }, // Descrição
      { wch: 12 }, // Valor
      { wch: 12 }, // Data Vencimento
      { wch: 30 }, // Payment ID BANCO
      { wch: 30 }, // Payment ID ASAAS
      { wch: 15 }, // Status
      { wch: 60 }  // Link Asaas
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Correção Payment IDs');

    const nomeArquivo = 'Correcao_4_Registros_Payment_IDs.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`✅ Planilha gerada com sucesso!`);
    console.log(`📁 Arquivo: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}`);
    console.log(`\n📊 Total de registros: ${dados.length}`);
    console.log(`   ⚠️  Para atualizar: ${dados.filter(d => d.Status === '⚠️ ATUALIZAR').length}`);
    console.log(`   ❌ Sem cobrança Asaas: ${dados.filter(d => d.Status === '❌ SEM COBRANÇA').length}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
