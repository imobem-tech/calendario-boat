// ============================================================
// enriquecer-api.js — V.2609142200
// ENDPOINT PARA ENRIQUECER DADOS DO EXTRATO
// + FIX: Usa classificarLancamento() (banco_categorias)
// + FIX: Salva ID da categoria (não nome)
// + FIX: Status OK apenas se TUDO encontrado (cliente + CR + classificacao)
// + FIX: Tolerância valor ±5% com campo Total do CR
// + FIX: Tolerância data ±10 dias (não ±7)
// + FIX: Testa TODOS os homônimos até achar CR
// + NOVO: Filtros data_inicio, data_fim (igual reclassificar)
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';
import { classificarLancamento } from './classificacao-automatica.js';

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

// Buscar CR (Contas a Receber)
// Tolerâncias: Data ±10 dias, Valor ±5% (campo Total)
async function buscarCR(codigoCliente, dataExtrato, valorExtrato, empresa) {
  const dataStr = dataExtrato instanceof Date
    ? dataExtrato.toISOString().split('T')[0]
    : dataExtrato.toString().split('T')[0];

  const codigoEmpresa = empresa === 'ALLMAX' ? 1 : empresa === 'IMOBEM' ? 2 : 3;
  const valorNum = Math.abs(parseFloat(valorExtrato)); // Valor absoluto

  const result = await pool.query(`
    SELECT "Codigo", "Código_Cliente", "Data_Vencimento", "Total", "Descricao"
    FROM "Contas_Receber"
    WHERE "Código_Cliente" = $1 AND "Empresa" = $2
    ORDER BY "Data_Vencimento"
  `, [codigoCliente, codigoEmpresa]);

  for (const cr of result.rows) {
    const dataVenc = new Date(cr.Data_Vencimento);
    const dataExt = new Date(dataStr);
    const difDias = Math.abs((dataVenc - dataExt) / (1000 * 60 * 60 * 24));
    const valorCR = parseFloat(cr.Total); // ✅ Campo Total (não Valor!)
    const difValorPercent = Math.abs((valorCR - valorNum) / valorCR);

    // Tolerância: ±10 dias E ±5% do valor
    if (difDias <= 10 && difValorPercent <= 0.05) {
      return {
        codigo: cr.Codigo,
        descricao: cr.Descricao,
        valor: cr.Total
      };
    }
  }
  return null;
}

// ENDPOINT POST /api/banco/enriquecer
router.post('/', async (req, res) => {
  try {
    const { empresa = 'ALLMAX', data_inicio, data_fim } = req.query;

    // Montar query com filtros
    let query = `
      SELECT id, empresa, data, valor, tipo, descricao_original, nome_origem,
             observacoes, classificacao, status, cpf_cnpj_origem
      FROM bank_extratos
      WHERE tipo_importacao = 'OFX'
        AND banco = 'Asaas'
        AND empresa = $1
        AND (nome_origem IS NULL OR nome_origem = '')
    `;

    const params = [empresa];
    let paramIndex = 2;

    // Filtro de datas (opcional)
    if (data_inicio && data_fim) {
      query += ` AND data BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(data_inicio, data_fim);
      paramIndex += 2;
    }

    query += ` ORDER BY data, id`;

    const registros = await pool.query(query, params);

    const stats = {
      processados: 0,
      clienteEncontrado: 0,
      crEncontrada: 0,
      classificado: 0,
      statusOK: 0,
      erros: 0
    };

    for (const reg of registros.rows) {
      try {
        stats.processados++;

        // 1. Extrair nome do cliente
        const nomeParcial = extrairNome(reg.descricao_original);
        if (!nomeParcial) continue;

        // 2. Buscar cliente(s) - pode ter HOMÔNIMOS!
        const clientes = await buscarCliente(nomeParcial, reg.empresa);
        if (clientes.length === 0) continue;

        stats.clienteEncontrado++;

        // 3. TESTAR TODOS OS CLIENTES até achar CR que bate
        let clienteSelecionado = null;
        let cr = null;

        for (const cliente of clientes) {
          const crTeste = await buscarCR(
            cliente.Codigo,
            reg.data,
            reg.valor,
            reg.empresa
          );

          if (crTeste) {
            // Achou CR! Este é o cliente correto
            clienteSelecionado = cliente;
            cr = crTeste;
            break; // Para de testar outros homônimos
          }
        }

        // Se não achou nenhuma CR em nenhum cliente, pega o primeiro
        if (!clienteSelecionado) {
          clienteSelecionado = clientes[0];
        }

        // 4. Preencher observacoes com descrição da CR (se encontrou)
        let observacoes = reg.observacoes || '';
        let crEncontrada = false;
        if (cr) {
          observacoes = cr.descricao;
          crEncontrada = true;
          stats.crEncontrada++;
        }

        // 5. Classificar automaticamente
        const textoParaClassificar = observacoes || reg.descricao_original;
        const resultado = await classificarLancamento({
          description: textoParaClassificar,
          value: Math.abs(reg.valor),
          tipo: reg.tipo,
          empresa: reg.empresa,
          cpfCnpjOrigem: reg.cpf_cnpj_origem || clienteSelecionado.Cliente_CPF
        });

        let categoriaId = reg.classificacao; // Mantém atual se não classificar
        let classificou = false;
        if (resultado && resultado.categoria_id) {
          categoriaId = resultado.categoria_id;
          classificou = true;
          stats.classificado++;
        }

        // 6. Status = OK SOMENTE se encontrou TUDO (cliente + CR + classificacao)
        const tudoEncontrado = crEncontrada && classificou;
        const novoStatus = tudoEncontrado ? 'OK' : reg.status; // Mantém atual se não completou

        if (tudoEncontrado) {
          stats.statusOK++;
        }

        // 7. Atualizar registro
        await pool.query(`
          UPDATE bank_extratos
          SET nome_origem = $1,
              cpf_cnpj_origem = $2,
              observacoes = $3,
              classificacao = $4::TEXT,
              status = $5
          WHERE id = $6
        `, [
          clienteSelecionado.Cliente_Nome,
          clienteSelecionado.Cliente_CPF,
          observacoes,
          categoriaId, // ✅ ID numérico (ou mantém atual)
          novoStatus,  // ✅ OK só se tudo encontrado
          reg.id
        ]);

      } catch (err) {
        console.error(`❌ Erro ao processar ID ${reg.id}:`, err);
        stats.erros++;
      }
    }

    res.json({
      sucesso: true,
      stats: {
        processados: stats.processados,
        clienteEncontrado: stats.clienteEncontrado,
        crEncontrada: stats.crEncontrada,
        classificado: stats.classificado,
        statusOK: stats.statusOK,
        erros: stats.erros
      }
    });

  } catch (err) {
    console.error('❌ Erro ao enriquecer:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
