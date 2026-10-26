// ============================================================
// verificar_cobrancas_felipe_asaas.js — V.2610261045
// Verifica cobranças do Felipe no Asaas e seus externalReference
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ASAAS_BASE_URL = 'https://www.asaas.com/api/v3';
const CLIENTE_FELIPE = 4364;
const IDS_FELIPE = [50287, 50288, 50289, 50290];

async function buscarApiKey(empresa) {
  const { rows } = await pool.query(`
    SELECT "API_Key"
    FROM "Centros_Custos"
    WHERE "Codigo" = $1 AND "Inativo" IS NOT TRUE
    LIMIT 1
  `, [Number(empresa)]);
  return rows[0]?.API_Key || null;
}

async function buscarCustomerId(codCliente) {
  const { rows } = await pool.query(`
    SELECT "Cliente_ID_tab_8" as customer_id, "Cliente_Nome"
    FROM "Cliente"
    WHERE "Codigo" = $1
  `, [codCliente]);
  return rows[0] || null;
}

async function buscarPaymentsAsaas(apiKey, customerId) {
  try {
    // Buscar payments do Felipe em 2027
    const url = `${ASAAS_BASE_URL}/payments?customer=${customerId}&dueDate[ge]=2027-01-01&dueDate[le]=2027-12-31&limit=100`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey
      }
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    console.error(`Erro: ${error.message}`);
    return [];
  }
}

(async () => {
  try {
    console.log('\n🔍 VERIFICANDO COBRANÇAS DO FELIPE NO ASAAS\n');
    console.log('═'.repeat(100));

    // 1. Buscar dados do Felipe
    const cliente = await buscarCustomerId(CLIENTE_FELIPE);
    if (!cliente) {
      console.log('❌ Cliente não encontrado');
      await pool.end();
      return;
    }

    console.log(`\n📋 Cliente: ${CLIENTE_FELIPE} - ${cliente.Cliente_Nome}`);
    console.log(`   Customer ID Asaas: ${cliente.customer_id}`);

    // 2. Buscar CRs do Felipe no banco
    console.log('\n\n📦 CRs DO FELIPE NO BANCO:\n');
    console.log('─'.repeat(100));

    const crsData = [];
    for (const id of IDS_FELIPE) {
      const { rows } = await pool.query(`
        SELECT "ID", "Codigo", "Descrição", "Valor", "Data_Vencimento"
        FROM "Contas_Receber"
        WHERE "ID" = $1
      `, [id]);

      if (rows[0]) {
        const cr = rows[0];
        crsData.push(cr);
        console.log(`ID ${cr.ID} | Código ${cr.Codigo} | Venc: ${cr.Data_Vencimento?.toISOString().split('T')[0]} | R$ ${parseFloat(cr.Valor).toFixed(2)}`);
        console.log(`   ${cr.Descrição}`);
      }
    }

    // 3. Buscar API Key
    const apiKey = await buscarApiKey(8); // ALLMAX
    if (!apiKey) {
      console.log('\n❌ API Key não encontrada');
      await pool.end();
      return;
    }

    // 4. Buscar cobranças no Asaas
    console.log('\n\n💳 COBRANÇAS DO FELIPE NO ASAAS (2027):\n');
    console.log('─'.repeat(100));

    const payments = await buscarPaymentsAsaas(apiKey, cliente.customer_id);

    if (payments.length === 0) {
      console.log('❌ NENHUMA cobrança encontrada no Asaas para 2027');
    } else {
      console.log(`✅ Encontradas ${payments.length} cobrança(s):\n`);

      payments.forEach((p, idx) => {
        console.log(`${idx + 1}. Payment ID: ${p.id}`);
        console.log(`   Status: ${p.status}`);
        console.log(`   Valor: R$ ${p.value}`);
        console.log(`   Vencimento: ${p.dueDate}`);
        console.log(`   Descrição: ${p.description || 'N/A'}`);
        console.log(`   📌 externalReference: ${p.externalReference || 'NÃO TEM'}`);
        console.log(`   Link: https://www.asaas.com/payment/detail/${p.id}`);
        console.log('');
      });
    }

    // 5. Análise
    console.log('\n\n' + '═'.repeat(100));
    console.log('\n📊 ANÁLISE:\n');
    console.log(`   CRs no BANCO: ${crsData.length}`);
    console.log(`   Códigos usados: ${crsData.map(cr => cr.Codigo).join(', ')}`);
    console.log(`\n   Cobranças no ASAAS: ${payments.length}`);

    if (payments.length > 0) {
      const externalRefs = payments.map(p => p.externalReference || 'SEM').join(', ');
      console.log(`   externalReference(s): ${externalRefs}`);

      console.log('\n\n💡 PRÓXIMOS PASSOS:');
      console.log('   1. Renumerar os 4 CRs no banco (novos códigos)');
      console.log('   2. Atualizar externalReference no Asaas com os novos códigos');
      console.log('   3. Verificar se precisa criar cobranças faltantes\n');
    }

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
