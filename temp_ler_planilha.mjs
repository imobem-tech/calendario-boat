// ============================================================
// Ler e analisar PB_embarcações.xlsx
// V.2606061340
// ============================================================
import ExcelJS from 'exceljs';

async function lerPlanilha() {
  try {
    console.log('🔍 LENDO PLANILHA PB_embarcações.xlsx...\n');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('PB_embarcações.xlsx');

    console.log(`📊 Total de abas: ${workbook.worksheets.length}\n`);

    workbook.worksheets.forEach((ws, index) => {
      console.log(`Aba ${index + 1}: "${ws.name}" (${ws.rowCount} linhas)`);
    });

    console.log('\n═'.repeat(100));
    console.log('📋 ANALISANDO PRIMEIRA ABA');
    console.log('═'.repeat(100));
    console.log('');

    const worksheet = workbook.worksheets[0];

    console.log(`Nome da aba: "${worksheet.name}"`);
    console.log(`Total de linhas: ${worksheet.rowCount}`);
    console.log(`Total de colunas: ${worksheet.columnCount}`);
    console.log('');

    console.log('═'.repeat(100));
    console.log('📄 PRIMEIRAS 20 LINHAS (estrutura completa):');
    console.log('═'.repeat(100));
    console.log('');

    let rowNum = 0;
    worksheet.eachRow((row, rowIndex) => {
      if (rowIndex <= 20) {
        const cells = [];

        // Pegar todas as células da linha
        for (let colNum = 1; colNum <= Math.min(row.cellCount, 10); colNum++) {
          const cell = row.getCell(colNum);
          let valor = cell.value;

          // Formatar valor
          if (valor === null || valor === undefined) {
            valor = '<vazio>';
          } else if (typeof valor === 'object') {
            if (valor.formula) {
              valor = `=FÓRMULA`;
            } else if (valor.text) {
              valor = valor.text;
            } else if (valor.result !== undefined) {
              valor = valor.result;
            } else {
              valor = JSON.stringify(valor);
            }
          }

          cells.push(String(valor).substring(0, 20));
        }

        console.log(`Linha ${String(rowIndex).padStart(3)}: ${cells.join(' | ')}`);
      }
    });

    console.log('');
    console.log('═'.repeat(100));
    console.log('📊 ANÁLISE DE CONTEÚDO:');
    console.log('═'.repeat(100));
    console.log('');

    // Análise da primeira célula
    const primeiraLinha = worksheet.getRow(1);
    console.log('PRIMEIRA LINHA (possível cabeçalho):');
    for (let i = 1; i <= Math.min(primeiraLinha.cellCount, 10); i++) {
      const cell = primeiraLinha.getCell(i);
      console.log(`  Coluna ${i}: "${cell.value}"`);
    }

    console.log('');
    console.log('SEGUNDA LINHA (primeiro dado):');
    const segundaLinha = worksheet.getRow(2);
    for (let i = 1; i <= Math.min(segundaLinha.cellCount, 10); i++) {
      const cell = segundaLinha.getCell(i);
      console.log(`  Coluna ${i}: "${cell.value}"`);
    }

    console.log('');
    console.log('═'.repeat(100));
    console.log('🔍 BUSCANDO PADRÕES:');
    console.log('═'.repeat(100));
    console.log('');

    // Contar valores únicos na coluna 1
    const valoresCol1 = new Set();
    const valoresCol2 = new Set();

    worksheet.eachRow((row, rowIndex) => {
      if (rowIndex > 1 && rowIndex <= 50) {
        const val1 = row.getCell(1).value;
        const val2 = row.getCell(2).value;

        if (val1) valoresCol1.add(String(val1));
        if (val2) valoresCol2.add(String(val2));
      }
    });

    console.log(`Valores únicos na Coluna 1 (primeiras 50 linhas): ${valoresCol1.size}`);
    console.log('Exemplos:', Array.from(valoresCol1).slice(0, 10).join(', '));
    console.log('');

    console.log(`Valores únicos na Coluna 2 (primeiras 50 linhas): ${valoresCol2.size}`);
    console.log('Exemplos:', Array.from(valoresCol2).slice(0, 10).join(', '));
    console.log('');

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.error(err.stack);
  }
}

lerPlanilha();
