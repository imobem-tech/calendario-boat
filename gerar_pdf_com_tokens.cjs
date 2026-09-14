// ============================================================
// GERADOR DE PDF COM TOKENS - V.2609141840
// Busca dados da API e usa tokens para links seguros
// ============================================================

const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');

// URL da API (production)
const API_URL = 'https://calendario-boat-production.up.railway.app/api/banco/extrato/listar?empresa=ALLMAX&mes=2026-09';

async function buscarDadosAPI() {
  return new Promise((resolve, reject) => {
    https.get(API_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function gerarPDF() {
  console.log('🚀 GERADOR DE PDF COM TOKENS');
  console.log('');

  try {
    // 1. Buscar dados da API
    console.log('1️⃣ Buscando dados da API...');
    console.log(`   URL: ${API_URL}`);

    const dados = await buscarDadosAPI();

    console.log(`   ✅ ${dados.lancamentos.length} lançamentos`);
    console.log(`   ✅ Token: ${dados.token}`);
    console.log('');

    // 2. Verificar se há token
    if (!dados.token) {
      console.log('⚠️ Nenhum anexo encontrado, não há token');
      return;
    }

    // 3. Gerar HTML
    console.log('2️⃣ Gerando HTML com tokens...');

    const htmlContent = gerarHTMLCompleto(dados);
    const htmlPath = 'D:\\OneDrive\\GESTAO_DZ\\Claude_DZ\\extrato_ALLMAX_set2026_COM_TOKENS.html';
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    console.log(`   ✅ HTML salvo: ${htmlPath}`);
    console.log('');

    // 4. Gerar PDF
    console.log('3️⃣ Gerando PDF...');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfPath = 'D:\\OneDrive\\GESTAO_DZ\\Claude_DZ\\extrato_ALLMAX_set2026_COM_TOKENS.pdf';
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    await browser.close();

    console.log(`   ✅ PDF salvo: ${pdfPath}`);
    console.log('');

    console.log('🎉 GERADO COM SUCESSO!');
    console.log('');
    console.log('🔐 SEGURANÇA:');
    console.log(`   • Token único: ${dados.token}`);
    console.log(`   • URLs seguras geradas`);
    console.log(`   • Sem exposição de URLs diretas`);
    console.log('');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

function gerarHTMLCompleto(dados) {
  // Funções auxiliares
  const formatarData = (dataISO) => {
    const d = new Date(dataISO);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}<br>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatarValor = (v) => Math.abs(v).toFixed(2).replace('.', ',');

  const formatarCpfCnpj = (cpf_cnpj) => {
    if (!cpf_cnpj) return '-';
    const limpo = cpf_cnpj.replace(/\D/g, '');
    if (limpo.length === 11) return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (limpo.length === 14) return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return limpo;
  };

  // Saldos
  const saldoInicial = dados.totais.saldo_acumulado - dados.totais.saldo;
  const saldoFinal = dados.totais.saldo_acumulado;

  // Gerar lançamentos HTML
  let lancamentosHTML = '';
  dados.lancamentos.forEach(lanc => {
    const categoriaHTML = lanc.categoria ?
      `<span class="categoria" style="background-color: ${lanc.categoria.cor}20; color: ${lanc.categoria.cor}">${lanc.categoria.icone} ${lanc.categoria.nome}</span>` :
      '<span class="categoria pendente">⚠️ Não classificado</span>';

    const origemHTML = lanc.origem.nome ?
      `<span class="origem-nome">${lanc.origem.nome}</span><span class="origem-cpf">${formatarCpfCnpj(lanc.origem.cpf_cnpj)}</span>` :
      '<span class="origem-nome">-</span>';

    // **USAR URL_TOKEN** ao invés de URLs diretas!
    let anexoHTML = '<span class="sem-anexo">-</span>';
    if (lanc.tem_anexo && lanc.url_token) {
      anexoHTML = `<a href="${lanc.url_token}" target="_blank" rel="noopener noreferrer" class="anexo-link" title="Clique para abrir ${lanc.anexos.length} arquivo(s)">📎${lanc.anexos.length}</a>`;
    }

    lancamentosHTML += `
      <tr>
        <td class="center">${formatarData(lanc.importado_em)}</td>
        <td>${categoriaHTML}</td>
        <td class="descricao-cell">${lanc.descricao.substring(0, 150)}</td>
        <td class="center">${anexoHTML}</td>
        <td>${origemHTML}</td>
        <td class="observacoes-cell">${lanc.observacoes || '-'}</td>
        <td class="right valor ${lanc.valor >= 0 ? 'credito' : 'debito'}">${lanc.valor >= 0 ? '' : '-'}${formatarValor(lanc.valor)}</td>
        <td class="right valor ${lanc.saldo_linha >= 0 ? 'credito' : 'debito'}">${lanc.saldo_linha >= 0 ? '' : '-'}${formatarValor(lanc.saldo_linha)}</td>
      </tr>`;
  });

  // Resumo categorias
  const resumoCategorias = {};
  dados.lancamentos.forEach(l => {
    const cat = l.categoria ? `${l.categoria.icone} ${l.categoria.nome}` : '⚠️ Não classificado';
    resumoCategorias[cat] = (resumoCategorias[cat] || 0) + l.valor;
  });

  let resumoCategoriasHTML = '';
  Object.entries(resumoCategorias).sort((a, b) => b[1] - a[1]).forEach(([nome, total]) => {
    resumoCategoriasHTML += `
      <div class="categoria-resumo">
        <span class="nome">${nome}</span>
        <span class="total ${total >= 0 ? 'credito' : 'debito'}">${total >= 0 ? '' : '-'}${formatarValor(total)}</span>
      </div>`;
  });

  // HTML completo (usar template do modelo aprovado)
  return fs.readFileSync('C:\\Users\\NOTEBOOK\\Downloads\\modelo_extrato_pdf.html', 'utf8')
    .replace('<!-- LANÇAMENTOS_AQUI -->', lancamentosHTML)
    .replace('<!-- RESUMO_CATEGORIAS_AQUI -->', resumoCategoriasHTML)
    .replace('SALDO_INICIAL_VALOR', formatarValor(saldoInicial))
    .replace('SALDO_FINAL_VALOR', formatarValor(saldoFinal))
    .replace('TOTAL_CREDITOS', formatarValor(dados.totais.creditos))
    .replace('TOTAL_DEBITOS', formatarValor(dados.totais.debitos))
    .replace('TOTAL_LANCAMENTOS', dados.totais.lancamentos);
}

gerarPDF();
