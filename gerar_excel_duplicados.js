// ============================================================
// gerar_excel_duplicados.js — V.2610261010
// Gera planilha Excel com dados dos duplicados
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import XLSX from 'xlsx';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const IDS_DUPLICADOS = [50287, 50306, 50288, 50307, 50289, 50308, 50290, 50309];

(async () => {
  try {
    console.log('\n📊 Gerando planilha Excel...\n');

    const dados = [];

    for (const id of IDS_DUPLICADOS) {
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
        const r = rows[0];
        const linkAsaas = r.Portador
          ? `https://www.asaas.com/payment/detail/${r.Portador}`
          : 'SEM COBRANÇA';

        const obs = r.Descrição?.includes('Parlela Cota') || r.Descrição?.includes('Parcela Cota')
          ? 'Parcela Cota - RENUMERAR'
          : 'Hora Motor - MANTER';

        dados.push({
          'ID CR': r.ID,
          'Código CR': r.Codigo,
          'Empresa': r.Empresa,
          'Código Cliente': r.Código_Cliente,
          'Nome Cliente': r.Cliente_Nome || 'N/A',
          'Descrição': r.Descrição,
          'Valor': parseFloat(r.Valor),
          'Vencimento': r.Data_Vencimento?.toISOString().split('T')[0] || 'N/A',
          'Payment ID': r.Portador || 'N/A',
          'Link Asaas': linkAsaas,
          'Observação': obs
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
      { wch: 8 },  // Empresa
      { wch: 12 }, // Código Cliente
      { wch: 35 }, // Nome Cliente
      { wch: 45 }, // Descrição
      { wch: 12 }, // Valor
      { wch: 12 }, // Vencimento
      { wch: 25 }, // Payment ID
      { wch: 60 }, // Link Asaas
      { wch: 25 }  // Observação
    ];
    ws['!cols'] = wscols;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Duplicados CR');

    // Salvar arquivo
    const nomeArquivo = 'Duplicados_CR_Asaas.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`✅ Planilha gerada com sucesso!`);
    console.log(`📁 Arquivo: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}`);
    console.log(`\n📊 Total de registros: ${dados.length}`);
    console.log(`   • Parcela Cota (RENUMERAR): ${dados.filter(d => d.Observação.includes('RENUMERAR')).length}`);
    console.log(`   • Hora Motor (MANTER): ${dados.filter(d => d.Observação.includes('MANTER')).length}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
