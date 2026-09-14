// ============================================================
// GERADOR DE PDF DO EXTRATO BANCÁRIO - DADOS REAIS
// V.2609141715
// ============================================================

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function gerarPDF() {
  console.log('🚀 Iniciando geração do PDF...');

  // Caminho do HTML gerado
  const htmlPath = 'D:\\OneDrive\\GESTAO_DZ\\Claude_DZ\\extrato_ALLMAX_setembro_2026.html';

  // Verificar se HTML existe
  if (!fs.existsSync(htmlPath)) {
    console.error('❌ Arquivo HTML não encontrado:', htmlPath);
    process.exit(1);
  }

  console.log('📄 Lendo HTML:', htmlPath);
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Caminho de saída do PDF
  const pdfPath = 'D:\\OneDrive\\GESTAO_DZ\\Claude_DZ\\extrato_ALLMAX_setembro_2026.pdf';

  console.log('🌐 Iniciando navegador...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('📝 Carregando HTML...');
  await page.setContent(htmlContent, {
    waitUntil: 'networkidle0'
  });

  console.log('🖨️ Gerando PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '10mm',
      right: '10mm',
      bottom: '10mm',
      left: '10mm'
    }
  });

  await browser.close();

  console.log('');
  console.log('✅ PDF GERADO COM SUCESSO!');
  console.log('');
  console.log(`📄 Arquivo salvo em:`);
  console.log(`   ${pdfPath}`);
  console.log('');

  // Informações do arquivo
  const stats = fs.statSync(pdfPath);
  const fileSizeInKB = (stats.size / 1024).toFixed(2);
  console.log(`📊 Tamanho: ${fileSizeInKB} KB`);
  console.log('');
}

// Executar
gerarPDF().catch(err => {
  console.error('❌ Erro ao gerar PDF:', err);
  process.exit(1);
});
