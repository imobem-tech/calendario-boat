// ============================================================
// enriquecer_ofx.js — V.2609142030
// ENRIQUECEDOR AUTOMÁTICO DE DADOS OFX
// Identifica cliente, busca CR, classifica automaticamente
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

// Extrair nome do cliente da descrição OFX
function extrairNome(descricao) {
  // Padrões possíveis:
  // "Cobranca recebida - fatura nr. 907981201 PERITO GARCIA"
  // "Transacao via Pix com chave para ARICELIA DA COSTA SILVA"

  let nome = null;

  // Padrão 1: "fatura nr. XXXXX NOME"
  let match = descricao.match(/fatura nr\.\s+\d+\s+([A-Z][A-Z\s]+?)(?:\s*$|$)/);
  if (match) {
    nome = match[1].trim();
  }

  // Padrão 2: "para NOME"
  if (!nome) {
    match = descricao.match(/para\s+([A-Z][A-Z\s]+?)(?:\s*$|$)/);
    if (match) {
      nome = match[1].trim();
    }
  }

  return nome;
}

// Buscar cliente por nome parcial
async function buscarCliente(nomeParcial, empresa) {
  const result = await pool.query(`
    SELECT "Codigo", "Cliente_Nome", "Cliente_CPF"
    FROM "Cliente"
    WHERE "Cliente_Nome" ILIKE $1
      AND "Empresa" = $2
  `, [`%${nomeParcial}%`, empresa === 'ALLMAX' ? 1 : empresa === 'IMOBEM' ? 2 : 3]);

  return result.rows;
}

// Buscar Conta a Receber relacionada
async function buscarCR(codigoCliente, dataExtrato, valorExtrato, empresa) {
  // Converter data para string YYYY-MM-DD
  const dataStr = dataExtrato instanceof Date
    ? dataExtrato.toISOString().split('T')[0]
    : dataExtrato.toString().split('T')[0];

  const codigoEmpresa = empresa === 'ALLMAX' ? 1 : empresa === 'IMOBEM' ? 2 : 3;
  const valorNum = parseFloat(valorExtrato);

  // Buscar CRs do cliente na empresa, ordenadas por data
  const result = await pool.query(`
    SELECT
      "Código_Cliente",
      "Data_Vencimento",
      "Valor",
      "Descrição"
    FROM "Contas_Receber"
    WHERE "Código_Cliente" = $1
      AND "Empresa" = $2
    ORDER BY "Data_Vencimento"
  `, [codigoCliente, codigoEmpresa]);

  // Filtrar manualmente por data e valor
  for (const cr of result.rows) {
    const dataVenc = new Date(cr.Data_Vencimento);
    const dataExt = new Date(dataStr);
    const difDias = Math.abs((dataVenc - dataExt) / (1000 * 60 * 60 * 24));

    const valorCR = parseFloat(cr.Valor);
    const difValorPercent = Math.abs((valorCR - valorNum) / valorCR);

    if (difDias <= 7 && difValorPercent <= 0.05) {
      return cr;
    }
  }

  return null;
}

// Classificar automaticamente usando regras
async function classificarAutomaticamente(texto, empresa) {
  const regras = await pool.query(`
    SELECT classificacao, palavras_chave
    FROM bank_regras_classificacao
    WHERE ativa = true
      AND ativo = true
      AND (empresa = $1 OR empresa IS NULL)
    ORDER BY prioridade DESC
  `, [empresa]);

  const textoLower = texto.toLowerCase();

  for (const regra of regras.rows) {
    if (!regra.palavras_chave) continue;

    const palavras = regra.palavras_chave.split(',').map(p => p.trim().toLowerCase());

    // Verificar se alguma palavra-chave está presente
    if (palavras.some(palavra => textoLower.includes(palavra))) {
      return regra.classificacao;
    }
  }

  return null;
}

// ============================================================
// PROCESSADOR PRINCIPAL
// ============================================================

async function enriquecer() {
  try {
    console.log('\n🤖 ENRIQUECEDOR AUTOMÁTICO DE DADOS OFX\n');
    console.log('='.repeat(80) + '\n');

    // Buscar registros OFX sem nome_origem
    const registros = await pool.query(`
      SELECT
        id,
        empresa,
        data,
        valor,
        descricao_original,
        nome_origem,
        cpf_cnpj_origem,
        observacoes,
        classificacao
      FROM bank_extratos
      WHERE tipo_importacao = 'OFX'
        AND banco = 'Asaas'
        AND empresa = 'ALLMAX'
        AND (nome_origem IS NULL OR nome_origem = '')
      ORDER BY data, id
    `);

    console.log(`📊 Total de registros para enriquecer: ${registros.rows.length}\n`);
    console.log('='.repeat(80) + '\n');

    if (registros.rows.length === 0) {
      console.log('✅ Nenhum registro precisa ser enriquecido!\n');
      return;
    }

    const stats = {
      processados: 0,
      clienteEncontrado: 0,
      clienteUnico: 0,
      clienteDuplicado: 0,
      crEncontrada: 0,
      classificado: 0,
      semNome: 0,
      erros: 0
    };

    for (const reg of registros.rows) {
      try {
        stats.processados++;

        console.log(`\n[${stats.processados}/${registros.rows.length}] ID ${reg.id} | ${reg.data.toISOString().split('T')[0]} | R$ ${parseFloat(reg.valor).toFixed(2)}`);

        // 1. Extrair nome
        const nomeParcial = extrairNome(reg.descricao_original);

        if (!nomeParcial) {
          console.log(`  ⚠️  Não foi possível extrair nome da descrição`);
          console.log(`     Desc: ${reg.descricao_original.substring(0, 60)}`);
          stats.semNome++;
          continue;
        }

        console.log(`  🔍 Nome extraído: "${nomeParcial}"`);

        // 2. Buscar cliente
        const clientes = await buscarCliente(nomeParcial, reg.empresa);

        if (clientes.length === 0) {
          console.log(`  ❌ Cliente não encontrado`);
          continue;
        }

        stats.clienteEncontrado++;

        let clienteSelecionado = null;

        // 3. Se único, selecionar
        if (clientes.length === 1) {
          clienteSelecionado = clientes[0];
          stats.clienteUnico++;
          console.log(`  ✅ Cliente único: ${clienteSelecionado.Cliente_Nome}`);
        }
        // 4. Se múltiplos, usar CR como desempate
        else {
          console.log(`  ⚠️  ${clientes.length} clientes encontrados - usando CR como desempate:`);
          stats.clienteDuplicado++;

          for (const cliente of clientes) {
            console.log(`     • ${cliente.Cliente_Nome} (${cliente.Codigo})`);

            const cr = await buscarCR(cliente.Codigo, reg.data, reg.valor, reg.empresa);

            if (cr) {
              clienteSelecionado = cliente;
              console.log(`       ✅ CR encontrada! Cliente selecionado.`);
              break;
            }
          }

          if (!clienteSelecionado) {
            console.log(`     ❌ Nenhuma CR encontrada para desempate`);
            continue;
          }
        }

        // 5. Buscar CR do cliente selecionado
        const cr = await buscarCR(clienteSelecionado.Codigo, reg.data, reg.valor, reg.empresa);

        let observacoes = reg.observacoes || '';

        if (cr) {
          observacoes = cr.Descrição;
          stats.crEncontrada++;
          console.log(`  💰 CR encontrada: ${cr.Descrição.substring(0, 50)}`);
        } else {
          console.log(`  ⚠️  CR não encontrada`);
        }

        // 6. Classificar automaticamente
        let classificacao = reg.classificacao;
        const textoParaClassificar = observacoes || reg.descricao_original;

        const classificacaoAuto = await classificarAutomaticamente(textoParaClassificar, reg.empresa);

        if (classificacaoAuto) {
          classificacao = classificacaoAuto;
          stats.classificado++;
          console.log(`  🏷️  Classificação: ${classificacao}`);
        }

        // 7. Atualizar registro
        await pool.query(`
          UPDATE bank_extratos
          SET
            nome_origem = $1,
            cpf_cnpj_origem = $2,
            observacoes = $3,
            classificacao = $4::text,
            status = CASE WHEN $4::text IS NOT NULL THEN 'OK' ELSE status END
          WHERE id = $5
        `, [
          clienteSelecionado.Cliente_Nome,
          clienteSelecionado.Cliente_CPF,
          observacoes,
          classificacao,
          reg.id
        ]);

        console.log(`  ✅ Registro atualizado!`);

      } catch (err) {
        console.error(`  ❌ Erro ao processar ID ${reg.id}:`, err.message);
        stats.erros++;
      }
    }

    // Relatório final
    console.log('\n' + '='.repeat(80) + '\n');
    console.log('📊 RELATÓRIO FINAL:\n');
    console.log(`  Total processados: ${stats.processados}`);
    console.log(`  ✅ Cliente encontrado: ${stats.clienteEncontrado}`);
    console.log(`     ├─ Único: ${stats.clienteUnico}`);
    console.log(`     └─ Desempate por CR: ${stats.clienteDuplicado}`);
    console.log(`  💰 CR encontrada: ${stats.crEncontrada}`);
    console.log(`  🏷️  Classificados: ${stats.classificado}`);
    console.log(`  ⚠️  Sem nome extraído: ${stats.semNome}`);
    console.log(`  ❌ Erros: ${stats.erros}\n`);

    console.log('='.repeat(80) + '\n');
    console.log('✅ ENRIQUECIMENTO CONCLUÍDO!\n');

  } catch (err) {
    console.error('❌ Erro fatal:', err);
  } finally {
    await pool.end();
  }
}

enriquecer();
