// ============================================================
// preencher_nomes_clientes.js — V.2609141815
// BUSCAR NOMES DOS CLIENTES NA API ASAAS E ATUALIZAR BD
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Cache de API Keys
let apiKeysCache = null;

// Buscar API Keys do banco
async function buscarApiKeys() {
  if (apiKeysCache) return apiKeysCache;

  const result = await pool.query(`
    SELECT "Descrição", "API_Key"
    FROM "Centros_Custos"
    WHERE "API_Key" IS NOT NULL
  `);

  apiKeysCache = {};
  result.rows.forEach(row => {
    const desc = row.Descrição.toUpperCase();
    if (desc.includes('ALLMAX')) apiKeysCache.ALLMAX = row.API_Key;
    if (desc.includes('IMOBEM')) apiKeysCache.IMOBEM = row.API_Key;
    if (desc.includes('SUMMER')) apiKeysCache.SUMMER = row.API_Key;
  });

  return apiKeysCache;
}

// Buscar dados do cliente via API Asaas
async function buscarDadosCliente(customerId, empresa) {
  try {
    if (!customerId || !customerId.startsWith('cus_')) {
      return null;
    }

    // Buscar API Keys do banco
    const apiKeys = await buscarApiKeys();

    const apiKey = apiKeys[empresa];
    if (!apiKey) {
      console.error(`❌ API Key não encontrada para empresa: ${empresa}`);
      return null;
    }

    const url = `https://www.asaas.com/api/v3/customers/${customerId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Erro HTTP ${response.status} ao buscar ${customerId}`);
      return null;
    }

    const cliente = await response.json();

    return {
      nome: cliente.name || null,
      cpfCnpj: cliente.cpfCnpj || null
    };

  } catch (err) {
    console.error(`❌ Erro ao buscar cliente ${customerId}:`, err.message);
    return null;
  }
}

async function preencherNomes() {
  try {
    console.log('🔧 PREENCHENDO NOMES DOS CLIENTES NO BD\n');
    console.log('='.repeat(80) + '\n');

    // Buscar registros com customer ID (cus_)
    const result = await pool.query(`
      SELECT
        id,
        empresa,
        data,
        valor,
        descricao_original,
        cpf_cnpj_origem,
        nome_origem
      FROM bank_extratos
      WHERE banco = 'Asaas'
        AND cpf_cnpj_origem LIKE 'cus_%'
        AND (nome_origem IS NULL OR nome_origem = '')
      ORDER BY empresa, data, id
    `);

    console.log(`📊 Registros para atualizar: ${result.rows.length}\n`);

    if (result.rows.length === 0) {
      console.log('✅ Nenhum registro precisa ser atualizado!\n');
      return;
    }

    // Agrupar por customer ID para evitar chamadas duplicadas
    const custMap = new Map();
    result.rows.forEach(row => {
      const key = `${row.empresa}_${row.cpf_cnpj_origem}`;
      if (!custMap.has(key)) {
        custMap.set(key, {
          customerId: row.cpf_cnpj_origem,
          empresa: row.empresa,
          registros: []
        });
      }
      custMap.get(key).registros.push(row);
    });

    console.log(`👥 Clientes únicos: ${custMap.size}\n`);
    console.log('🔍 Buscando dados na API Asaas...\n');

    let processados = 0;
    let sucesso = 0;
    let erros = 0;

    for (const [key, { customerId, empresa, registros }] of custMap) {
      processados++;

      console.log(`[${processados}/${custMap.size}] ${empresa} - ${customerId}`);

      // Buscar dados na API
      const dados = await buscarDadosCliente(customerId, empresa);

      if (dados && dados.nome) {
        console.log(`   ✅ ${dados.nome} | ${dados.cpfCnpj || 'Sem CPF'}`);

        // Atualizar TODOS os registros deste cliente
        for (const reg of registros) {
          try {
            await pool.query(`
              UPDATE bank_extratos
              SET
                nome_origem = $1,
                cpf_cnpj_origem = $2
              WHERE id = $3
            `, [dados.nome, dados.cpfCnpj || customerId, reg.id]);

            sucesso++;
          } catch (err) {
            console.error(`   ❌ Erro ao atualizar registro ${reg.id}:`, err.message);
            erros++;
          }
        }

        console.log(`   📝 ${registros.length} registro(s) atualizado(s)\n`);

      } else {
        console.log(`   ⚠️  Não foi possível buscar dados\n`);
        erros += registros.length;
      }

      // Delay para não sobrecarregar API
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('='.repeat(80) + '\n');
    console.log('📊 RESUMO:\n');
    console.log(`  Total de registros: ${result.rows.length}`);
    console.log(`  Clientes únicos: ${custMap.size}`);
    console.log(`  ✅ Atualizados com sucesso: ${sucesso}`);
    console.log(`  ❌ Erros: ${erros}\n`);

    // Verificar resultado
    console.log('🔍 VERIFICAÇÃO FINAL:\n');

    const check = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN nome_origem IS NOT NULL AND nome_origem != '' THEN 1 END) as com_nome
      FROM bank_extratos
      WHERE banco = 'Asaas'
        AND empresa IN ('ALLMAX', 'IMOBEM', 'SUMMER')
        AND data >= '2026-09-01'
    `);

    const { total, com_nome } = check.rows[0];
    console.log(`  Total de registros Asaas (Set/2026): ${total}`);
    console.log(`  Com nome preenchido: ${com_nome} (${(com_nome/total*100).toFixed(1)}%)\n`);

    // Mostrar alguns exemplos
    const exemplos = await pool.query(`
      SELECT
        empresa,
        data,
        valor,
        nome_origem,
        cpf_cnpj_origem,
        descricao_original
      FROM bank_extratos
      WHERE banco = 'Asaas'
        AND nome_origem IS NOT NULL
        AND nome_origem != ''
      ORDER BY data DESC
      LIMIT 5
    `);

    if (exemplos.rows.length > 0) {
      console.log('📋 EXEMPLOS DE REGISTROS ATUALIZADOS:\n');

      exemplos.rows.forEach((ex, i) => {
        const dataF = ex.data.toISOString().split('T')[0];
        console.log(`${i+1}. [${dataF}] ${ex.empresa} | R$ ${ex.valor}`);
        console.log(`   Nome: ${ex.nome_origem}`);
        console.log(`   CPF:  ${ex.cpf_cnpj_origem}`);
        console.log(`   Desc: ${ex.descricao_original.substring(0, 50)}\n`);
      });
    }

    console.log('='.repeat(80) + '\n');
    console.log('✅ CONCLUÍDO!\n');

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

preencherNomes();
