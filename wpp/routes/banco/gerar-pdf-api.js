// ============================================================
// wpp/routes/banco/gerar-pdf-api.js — V.2609141905
// API PARA GERAR PDF DO EXTRATO BANCÁRIO
// ============================================================

import express from 'express';
import puppeteer from 'puppeteer';
import { nanoid } from 'nanoid';
import pkg from 'pg';

const { Pool } = pkg;
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * POST /api/banco/extrato/gerar-pdf
 * Gera PDF do extrato com os filtros aplicados
 *
 * Body:
 * - empresa: string
 * - mes: string (YYYY-MM) ou null
 * - data_inicio: string ou null
 * - data_fim: string ou null
 * - descricao: string
 * - dados: objeto com os dados do extrato
 */
router.post('/gerar-pdf', async (req, res) => {
  try {
    const { empresa, mes, data_inicio, data_fim, descricao, dados } = req.body;

    console.log('📄 Gerando PDF:', { empresa, mes, descricao });

    // Validações
    if (!dados || !dados.lancamentos || dados.lancamentos.length === 0) {
      return res.status(400).json({
        erro: 'Dados inválidos ou vazios'
      });
    }

    // Gerar HTML do PDF
    const htmlContent = gerarHTMLPDF(dados, empresa, descricao, mes, data_inicio, data_fim);

    // Gerar PDF com Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
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

    // Retornar PDF diretamente para download
    const nomeArquivo = `extrato_${empresa}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('❌ Erro ao gerar PDF:', err);
    res.status(500).json({ erro: err.message });
  }
});

function gerarHTMLPDF(dados, empresa, descricao, mes, data_inicio, data_fim) {
  // Funções auxiliares
  const formatarData = (dataISO) => {
    const d = new Date(dataISO);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}<br>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatarValor = (v) => {
    const valor = Math.abs(v).toFixed(2);
    const [inteiro, decimal] = valor.split('.');
    // Adicionar separador de milhares
    const inteiroFormatado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${inteiroFormatado},${decimal}`;
  };

  const formatarCpfCnpj = (cpf_cnpj) => {
    if (!cpf_cnpj) return '-';
    const limpo = cpf_cnpj.replace(/\D/g, '');
    if (limpo.length === 11) return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (limpo.length === 14) return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return limpo;
  };

  // Gerar lançamentos HTML
  let lancamentosHTML = '';
  dados.lancamentos.forEach(lanc => {
    // Categoria com fundo cinza, letra preta, SEM ícone
    const categoriaHTML = lanc.categoria ?
      `<span style="background: #e5e7eb; color: #000; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 500; display: inline-block;">${lanc.categoria.nome}</span>` :
      '<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 500;">Não classificado</span>';

    const origemHTML = lanc.origem.nome ?
      `<span style="font-weight: 500;">${lanc.origem.nome}</span><br><span style="font-size: 8px; color: #6b7280;">${formatarCpfCnpj(lanc.origem.cpf_cnpj)}</span>` :
      '<span>-</span>';

    // Anexo: apenas número, negrito, maior
    let anexoHTML = '<span style="color: #d1d5db; font-size: 10px;">-</span>';
    if (lanc.tem_anexo && lanc.url_token) {
      anexoHTML = `<a href="${lanc.url_token}" target="_blank" style="color: #10b981; text-decoration: none; font-weight: 700; font-size: 13px;">${lanc.anexos.length}</a>`;
    }

    lancamentosHTML += `
      <tr>
        <td style="text-align:center; font-size: 9px;">${formatarData(lanc.importado_em)}</td>
        <td style="font-weight: 500; font-size: 8px;">${lanc.empresa}</td>
        <td>${categoriaHTML}</td>
        <td style="font-size: 9px; line-height: 1.3;">${lanc.descricao.substring(0, 120)}</td>
        <td style="text-align:center;">${anexoHTML}</td>
        <td style="font-size: 9px;">${origemHTML}</td>
        <td style="font-size: 8px; color: #6b7280;">${lanc.observacoes || '-'}</td>
        <td style="text-align:right; font-weight: 600; font-size: 10px; color: ${lanc.valor >= 0 ? '#10b981' : '#ef4444'};">
          ${lanc.valor >= 0 ? '' : '-'}${formatarValor(lanc.valor)}
        </td>
        <td style="text-align:right; font-weight: 600; font-size: 10px; color: ${lanc.saldo_linha >= 0 ? '#10b981' : '#ef4444'};">
          ${lanc.saldo_linha >= 0 ? '' : '-'}${formatarValor(lanc.saldo_linha)}
        </td>
      </tr>`;
  });

  // Resumo por categoria
  const resumoCategorias = {};
  dados.lancamentos.forEach(l => {
    const cat = l.categoria ? `${l.categoria.icone} ${l.categoria.nome}` : '⚠️ Não classificado';
    resumoCategorias[cat] = (resumoCategorias[cat] || 0) + l.valor;
  });

  let resumoCategoriasHTML = '';
  Object.entries(resumoCategorias).sort((a, b) => b[1] - a[1]).forEach(([nome, total]) => {
    resumoCategoriasHTML += `
      <div style="display: flex; justify-content: space-between; padding: 8px; background: #f9fafb; border-radius: 4px; margin-bottom: 5px;">
        <span style="font-weight: 500;">${nome}</span>
        <span style="font-weight: 600; color: ${total >= 0 ? '#10b981' : '#ef4444'};">
          ${total >= 0 ? '' : '-'}${formatarValor(total)}
        </span>
      </div>`;
  });

  // HTML completo
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${descricao}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #333; }
        @page { size: A4 portrait; margin: 10mm; }

        .header {
            border-bottom: 2px solid #667eea;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }

        .header h1 {
            font-size: 20px;
            color: #667eea;
            margin-bottom: 5px;
        }

        .header p {
            font-size: 12px;
            color: #666;
        }

        .summary {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background: #f9fafb;
            border-radius: 8px;
        }

        .summary-item {
            text-align: center;
        }

        .summary-item label {
            display: block;
            font-size: 9px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 5px;
        }

        .summary-item .value {
            font-size: 14px;
            font-weight: 700;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 9px;
        }

        thead {
            background: #f3f4f6;
        }

        th {
            padding: 8px 5px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            border-bottom: 2px solid #d1d5db;
            font-size: 9px;
            text-transform: uppercase;
        }

        td {
            padding: 5px 5px;
            border-bottom: 1.5px solid #d1d5db;
            line-height: 1.2;
        }

        .footer {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 2px solid #667eea;
        }

        .footer h3 {
            font-size: 12px;
            margin-bottom: 10px;
            color: #374151;
        }

        .assinatura {
            margin-top: 20px;
            text-align: center;
            font-size: 9px;
            color: #9ca3af;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${descricao}</h1>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
            <p style="margin: 0;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
            <p style="margin: 0; text-align: right;">
                ${(() => {
                    if (mes) {
                        const [ano, mesNum] = mes.split('-');
                        const dataInicio = new Date(ano, mesNum - 1, 1);
                        const dataFim = new Date(ano, mesNum, 0);
                        return `Seleção: ${dataInicio.toLocaleDateString('pt-BR')} a ${dataFim.toLocaleDateString('pt-BR')}`;
                    } else if (data_inicio && data_fim) {
                        const di = new Date(data_inicio + 'T00:00:00');
                        const df = new Date(data_fim + 'T00:00:00');
                        return `Seleção: ${di.toLocaleDateString('pt-BR')} a ${df.toLocaleDateString('pt-BR')}`;
                    }
                    return 'Seleção: Todos os períodos';
                })()}
            </p>
        </div>
    </div>

    <div class="summary">
        <div class="summary-item">
            <label>Lançamentos</label>
            <div class="value">${dados.totais.lancamentos}</div>
        </div>
        <div class="summary-item">
            <label>Créditos</label>
            <div class="value" style="color: #10b981;">R$ ${formatarValor(dados.totais.creditos)}</div>
        </div>
        <div class="summary-item">
            <label>Débitos</label>
            <div class="value" style="color: #ef4444;">R$ ${formatarValor(dados.totais.debitos)}</div>
        </div>
        <div class="summary-item">
            <label>Saldo do Período</label>
            <div class="value" style="color: ${dados.totais.saldo >= 0 ? '#10b981' : '#ef4444'};">
                R$ ${formatarValor(dados.totais.saldo)}
            </div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 70px;">Data</th>
                <th style="width: 50px; font-size: 8px;">Empresa</th>
                <th style="width: 100px;">Categoria</th>
                <th>Descrição</th>
                <th style="width: 35px; text-align:center;">Anexos</th>
                <th style="width: 110px;">Origem</th>
                <th style="width: 90px;">Observações</th>
                <th style="width: 70px; text-align:right;">Valor</th>
                <th style="width: 70px; text-align:right;">Saldo</th>
            </tr>
        </thead>
        <tbody>
            ${lancamentosHTML}
        </tbody>
    </table>

    <div class="footer">
        <h3>📊 Resumo por Categoria</h3>
        ${resumoCategoriasHTML}

        <div class="assinatura">
            <p><strong>Extrato Bancário - Sistema Allmax</strong></p>
            <p>Este documento foi gerado eletronicamente e possui validade legal.</p>
        </div>
    </div>
</body>
</html>`;
}

export default router;

// ============================================================
// FIM
// ============================================================
