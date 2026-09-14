import XLSX from 'xlsx';
import fs from 'fs';

const filePath = 'D:\\\\OneDrive\\\\Documentos\\\\SM_24_Emb_Atividades.xlsx';

try {
  console.log('📂 Lendo arquivo Excel...\n');
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para JSON
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  
  console.log(`📊 Planilha: ${sheetName}`);
  console.log(`📋 Total de linhas: ${data.length}\n`);
  
  if (data.length > 0) {
    console.log('🔑 Colunas encontradas:');
    const colunas = Object.keys(data[0]);
    colunas.forEach((col, i) => {
      console.log(`   ${i+1}. ${col}`);
    });
    
    console.log('\n📄 Primeiras 5 linhas:\n');
    data.slice(0, 5).forEach((row, i) => {
      console.log(`Linha ${i+1}:`);
      Object.entries(row).forEach(([key, val]) => {
        console.log(`   ${key}: ${val}`);
      });
      console.log('');
    });
    
    // Salvar análise
    fs.writeFileSync(
      'scripts/atividades-estrutura.json',
      JSON.stringify({
        totalLinhas: data.length,
        colunas: colunas,
        primeiraLinha: data[0],
        amostra: data.slice(0, 10)
      }, null, 2)
    );
    
    console.log('✅ Análise salva em scripts/atividades-estrutura.json');
  }
  
} catch (err) {
  console.error('❌ Erro:', err.message);
  
  if (err.message.includes('ENOENT')) {
    console.log('\n⚠️  Arquivo não encontrado. Verificando caminho...');
  }
}
