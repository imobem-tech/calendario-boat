// ============================================================
// investigar_reclassificacao_411.js — V.2609142145
// INVESTIGAR POR QUE ID 411 NÃO FOI CLASSIFICADO
//
// Registro: bank_extratos ID 411
// CR: Contas_Receber ID 49594, documento 57306
// Cliente: CPF 01580632106
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';
import { classificarLancamento } from './classificacao-automatica.js';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function investigar() {
  try {
    console.log('\n🔍 INVESTIGANDO RECLASSIFICAÇÃO ID 411...\n');
    console.log('='.repeat(80));

    // 1. Buscar registro bank_extratos ID 411
    console.log('1️⃣ REGISTRO BANK_EXTRATOS ID 411:');
    const extrato = await pool.query(`
      SELECT
        id, empresa, banco, data, valor, tipo,
        descricao_original, cpf_cnpj_origem, nome_origem,
        classificacao, status, observacoes
      FROM bank_extratos
      WHERE id = 411
    `);

    if (extrato.rows.length === 0) {
      console.log('❌ Registro ID 411 não encontrado!');
      await pool.end();
      return;
    }

    const reg = extrato.rows[0];
    console.log(`   Empresa: ${reg.empresa}`);
    console.log(`   Data: ${reg.data}`);
    console.log(`   Valor: R$ ${reg.valor}`);
    console.log(`   Tipo: ${reg.tipo}`);
    console.log(`   Descrição: ${reg.descricao_original}`);
    console.log(`   CPF/CNPJ: ${reg.cpf_cnpj_origem || '(null)'}`);
    console.log(`   Nome: ${reg.nome_origem || '(null)'}`);
    console.log(`   Classificação: ${reg.classificacao || '(null)'}`);
    console.log(`   Status: ${reg.status}`);
    console.log(`   Observações: ${reg.observacoes || '(null)'}`);
    console.log('');

    // 2. Buscar CR ID 49594
    console.log('2️⃣ CONTAS_RECEBER ID 49594:');
    const cr = await pool.query(`
      SELECT
        "Codigo", "Codigo_Cliente", "Data_Vencimento", "Total", "Descricao"
      FROM "Contas_Receber"
      WHERE "Codigo" = 49594
    `);

    if (cr.rows.length > 0) {
      const c = cr.rows[0];
      console.log(`   Código: ${c.Codigo}`);
      console.log(`   Cliente: ${c.Codigo_Cliente}`);
      console.log(`   Vencimento: ${c.Data_Vencimento}`);
      console.log(`   Valor: R$ ${c.Total}`);
      console.log(`   Descrição: ${c.Descricao || '(null)'}`);
    } else {
      console.log('   ❌ CR ID 49594 não encontrada!');
    }
    console.log('');

    // 3. Buscar cliente pelo CPF
    console.log('3️⃣ CLIENTE CPF 01580632106:');
    const cliente = await pool.query(`
      SELECT "Codigo", "Cliente_Nome", "Cliente_CPF", "Empresa"
      FROM "Cliente"
      WHERE "Cliente_CPF" = '01580632106'
    `);

    if (cliente.rows.length > 0) {
      cliente.rows.forEach(c => {
        console.log(`   Código: ${c.Codigo}`);
        console.log(`   Nome: ${c.Cliente_Nome}`);
        console.log(`   CPF: ${c.Cliente_CPF}`);
        console.log(`   Empresa: ${c.Empresa}`);
        console.log('');
      });
    } else {
      console.log('   ❌ Cliente não encontrado!');
      console.log('');
    }

    // 4. Testar classificação automática
    console.log('4️⃣ TESTAR CLASSIFICAÇÃO AUTOMÁTICA:');
    console.log(`   Descrição: ${reg.descricao_original}`);
    console.log(`   Valor: ${Math.abs(reg.valor)}`);
    console.log(`   Tipo: ${reg.tipo}`);
    console.log(`   Empresa: ${reg.empresa}`);
    console.log(`   CPF: ${reg.cpf_cnpj_origem || '(null)'}`);
    console.log('');

    try {
      const resultado = await classificarLancamento({
        description: reg.descricao_original,
        value: Math.abs(reg.valor),
        tipo: reg.tipo,
        empresa: reg.empresa,
        cpfCnpjOrigem: reg.cpf_cnpj_origem
      });

      if (resultado && resultado.categoria_id) {
        console.log(`   ✅ CLASSIFICOU!`);
        console.log(`   Categoria: ${resultado.categoria_nome} (ID: ${resultado.categoria_id})`);
        console.log(`   Método: ${resultado.metodo}`);
      } else {
        console.log(`   ❌ NÃO CLASSIFICOU!`);
        console.log(`   Resultado: ${JSON.stringify(resultado)}`);
      }
    } catch (err) {
      console.log(`   ❌ ERRO: ${err.message}`);
      console.log(`   Stack: ${err.stack}`);
    }

    console.log('');

    // 5. Buscar categorias com palavras-chave relacionadas
    console.log('5️⃣ CATEGORIAS COM PALAVRAS-CHAVE RELACIONADAS:');
    const descLower = reg.descricao_original.toLowerCase();
    const palavras = descLower.split(/\s+/);

    const cats = await pool.query(`
      SELECT id, nome, empresa, tipo, palavras_chave, chave_aprendida
      FROM bank_categorias
      WHERE ativo = true
        AND (empresa = $1 OR empresa = 'TODAS' OR empresa IS NULL)
      ORDER BY nome
    `, [reg.empresa]);

    console.log(`   Total de categorias ativas: ${cats.rows.length}`);
    console.log('');

    let encontrou = false;
    cats.rows.forEach(cat => {
      // Verificar palavras-chave
      if (cat.palavras_chave) {
        const palavrasCat = cat.palavras_chave.split(',').map(p => p.trim().toLowerCase());
        const match = palavrasCat.some(p => descLower.includes(p));
        if (match) {
          console.log(`   ✅ MATCH por palavras-chave:`);
          console.log(`      ID: ${cat.id} - ${cat.nome}`);
          console.log(`      Palavras: ${cat.palavras_chave}`);
          console.log('');
          encontrou = true;
        }
      }

      // Verificar chave_aprendida
      if (cat.chave_aprendida) {
        console.log(`   🧠 Categoria com aprendizado:`);
        console.log(`      ID: ${cat.id} - ${cat.nome}`);
        console.log(`      Chave: ${cat.chave_aprendida}`);
        console.log('');
        encontrou = true;
      }
    });

    if (!encontrou) {
      console.log(`   ❌ Nenhuma categoria com palavras-chave relacionadas!`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('');

    await pool.end();
  } catch (err) {
    console.error('❌ Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

investigar();
