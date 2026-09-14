// ============================================================
// enriquecer-api.js — V.2609142050
// ENDPOINT PARA ENRIQUECER DADOS DO EXTRATO
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Extrair nome do cliente da descrição OFX
function extrairNome(descricao) {
  let nome = null;
  let match = descricao.match(/fatura nr\.\s+\d+\s+([A-Z][A-Z\s]+?)(?:\s*$|$)/);
  if (match) nome = match[1].trim();
  if (!nome) {
    match = descricao.match(/para\s+([A-Z][A-Z\s]+?)(?:\s*$|$)/);
    if (match) nome = match[1].trim();
  }
  return nome;
}

// Buscar cliente
async function buscarCliente(nomeParcial, empresa) {
  const result = await pool.query(`
    SELECT "Codigo", "Cliente_Nome", "Cliente_CPF"
    FROM "Cliente"
    WHERE "Cliente_Nome" ILIKE $1
      AND "Empresa" = $2
  `, [`%${nomeParcial}%`, empresa === 'ALLMAX' ? 1 : empresa === 'IMOBEM' ? 2 : 3]);
  return result.rows;
}

// Buscar CR
async function buscarCR(codigoCliente, dataExtrato, valorExtrato, empresa) {
  const dataStr = dataExtrato instanceof Date
    ? dataExtrato.toISOString().split('T')[0]
    : dataExtrato.toString().split('T')[0];

  const codigoEmpresa = empresa === 'ALLMAX' ? 1 : empresa === 'IMOBEM' ? 2 : 3;
  const valorNum = parseFloat(valorExtrato);

  const result = await pool.query(`
    SELECT "Código_Cliente", "Data_Vencimento", "Valor", "Descrição"
    FROM "Contas_Receber"
    WHERE "Código_Cliente" = $1 AND "Empresa" = $2
    ORDER BY "Data_Vencimento"
  `, [codigoCliente, codigoEmpresa]);

  for (const cr of result.rows) {
    const dataVenc = new Date(cr.Data_Vencimento);
    const dataExt = new Date(dataStr);
    const difDias = Math.abs((dataVenc - dataExt) / (1000 * 60 * 60 * 24));
    const valorCR = parseFloat(cr.Valor);
    const difValorPercent = Math.abs((valorCR - valorNum) / valorCR);
    if (difDias <= 7 && difValorPercent <= 0.05) return cr;
  }
  return null;
}

// Classificar
async function classificarAutomaticamente(texto, empresa) {
  if (!texto) return null;
  const regras = await pool.query(`
    SELECT id, nome_regra, classificacao, palavras_chave
    FROM bank_regras_classificacao
    WHERE ativa = true AND ativo = true
      AND (empresa = $1 OR empresa IS NULL)
    ORDER BY prioridade DESC
  `, [empresa]);

  const textoLower = texto.toLowerCase();
  for (const regra of regras.rows) {
    if (!regra.palavras_chave) continue;
    const palavras = regra.palavras_chave.split(',').map(p => p.trim().toLowerCase());
    if (palavras.some(palavra => textoLower.includes(palavra))) {
      return { classificacao: regra.classificacao };
    }
  }
  return null;
}

// ENDPOINT POST /api/banco/enriquecer
router.post('/', async (req, res) => {
  try {
    const { empresa = 'ALLMAX' } = req.query;

    // Buscar registros
    const registros = await pool.query(`
      SELECT id, empresa, data, valor, descricao_original, nome_origem, observacoes, classificacao
      FROM bank_extratos
      WHERE tipo_importacao = 'OFX'
        AND banco = 'Asaas'
        AND empresa = $1
        AND (nome_origem IS NULL OR nome_origem = '')
      ORDER BY data, id
    `, [empresa]);

    const stats = {
      processados: 0,
      clienteEncontrado: 0,
      crEncontrada: 0,
      classificado: 0,
      erros: 0
    };

    for (const reg of registros.rows) {
      try {
        stats.processados++;
        const nomeParcial = extrairNome(reg.descricao_original);
        if (!nomeParcial) continue;

        const clientes = await buscarCliente(nomeParcial, reg.empresa);
        if (clientes.length === 0) continue;

        let clienteSelecionado = clientes[0];
        stats.clienteEncontrado++;

        const cr = await buscarCR(clienteSelecionado.Codigo, reg.data, reg.valor, reg.empresa);
        let observacoes = reg.observacoes || '';
        if (cr) {
          observacoes = cr.Descrição;
          stats.crEncontrada++;
        }

        let classificacao = reg.classificacao;
        const resultado = await classificarAutomaticamente(observacoes || reg.descricao_original, reg.empresa);
        if (resultado) {
          classificacao = resultado.classificacao;
          stats.classificado++;
        }

        await pool.query(`
          UPDATE bank_extratos
          SET nome_origem = $1, cpf_cnpj_origem = $2, observacoes = $3,
              classificacao = $4::text,
              status = CASE WHEN $4::text IS NOT NULL THEN 'OK' ELSE status END
          WHERE id = $5
        `, [clienteSelecionado.Cliente_Nome, clienteSelecionado.Cliente_CPF, observacoes, classificacao, reg.id]);

      } catch (err) {
        console.error(`Erro ao processar ID ${reg.id}:`, err);
        stats.erros++;
      }
    }

    res.json({ sucesso: true, stats });

  } catch (err) {
    console.error('Erro ao enriquecer:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
