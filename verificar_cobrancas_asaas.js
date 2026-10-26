// ============================================================
// verificar_cobrancas_asaas.js — V.2610260955
// Verifica se registros duplicados têm cobrança no Asaas
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ASAAS_BASE_URL = 'https://www.asaas.com/api/v3';

// IDs dos registros duplicados
const IDS_DUPLICADOS = [50287, 50306, 50288, 50307, 50289, 50308, 50290, 50309];

// Mapeia Centro_Custo → campo ID do Asaas
function campoIdAsaas(centroCusto) {
  const map = { 6: 'Cliente_ID_tab_6', 8: 'Cliente_ID_tab_8', 9: 'Cliente_ID_tab_9' };
  return map[Number(centroCusto)] || 'Cliente_ID_tab_8';
}

async function buscarApiKey(empresa) {
  const { rows } = await pool.query(`
    SELECT "API_Key"
    FROM "Centros_Custos"
    WHERE "Codigo" = $1 AND "Inativo" IS NOT TRUE
    LIMIT 1
  `, [Number(empresa)]);

  return rows[0]?.API_Key || null;
}

async function consultarAsaas(apiKey, endpoint) {
  try {
    const url = `${ASAAS_BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey
      }
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch (error) {
    return null;
  }
}

(async () => {
  try {
    console.log('\n🔍 VERIFICANDO COBRANÇAS ASAAS');
    console.log('━'.repeat(80));
    console.log(`Verificando ${IDS_DUPLICADOS.length} registros duplicados\n`);

    let comCobranca = 0;
    let semCobranca = 0;

    for (const id of IDS_DUPLICADOS) {
      console.log(`\n${'═'.repeat(80)}`);
      console.log(`ID ${id}`);
      console.log('═'.repeat(80));

      // 1. Buscar dados do registro
      const crResult = await pool.query(`
        SELECT
          cr."ID",
          cr."Codigo",
          cr."Empresa",
          cr."Centro_Custo",
          cr."Código_Cliente",
          cr."Descrição",
          cr."Valor",
          cr."Data_Vencimento",
          cr."Portador",
          cr."agendamento_obs"
        FROM "Contas_Receber" cr
        WHERE cr."ID" = $1
      `, [id]);

      if (crResult.rows.length === 0) {
        console.log('❌ Registro não encontrado\n');
        continue;
      }

      const cr = crResult.rows[0];

      console.log(`Código CR: ${cr.Codigo}`);
      console.log(`Empresa: ${cr.Empresa} | Centro Custo: ${cr.Centro_Custo}`);
      console.log(`Cliente: ${cr.Código_Cliente}`);
      console.log(`Descrição: ${cr.Descrição}`);
      console.log(`Valor: R$ ${parseFloat(cr.Valor).toFixed(2)}`);
      console.log(`Vencimento: ${cr.Data_Vencimento?.toISOString().split('T')[0]}`);
      console.log(`Portador (Payment ID): ${cr.Portador || 'NÃO PREENCHIDO'}`);

      // 2. Verificar se já tem Payment ID no banco
      if (cr.Portador && cr.Portador.startsWith('pay_')) {
        console.log('\n✅ TEM PAYMENT ID NO BANCO');

        // Buscar API Key
        const apiKey = await buscarApiKey(cr.Centro_Custo || cr.Empresa);

        if (!apiKey) {
          console.log('⚠️  API Key não encontrada - não foi possível validar no Asaas');
          comCobranca++;
          continue;
        }

        // Consultar Asaas
        console.log('🔍 Consultando Asaas...');
        const payment = await consultarAsaas(apiKey, `/payments/${cr.Portador}`);

        if (payment && payment.id) {
          console.log(`✅ CONFIRMADO NO ASAAS`);
          console.log(`   - Payment ID: ${payment.id}`);
          console.log(`   - Status: ${payment.status}`);
          console.log(`   - Customer: ${payment.customer}`);
          console.log(`   - Valor: R$ ${payment.value}`);
          console.log(`   - Vencimento: ${payment.dueDate}`);
          comCobranca++;
        } else {
          console.log('⚠️  Payment ID no banco, mas NÃO ENCONTRADO no Asaas');
          console.log('   (Pode ter sido deletado ou ID inválido)');
          semCobranca++;
        }
      } else {
        // 3. Sem Payment ID - verificar se tem cobrança pelo cliente/valor/data
        console.log('\n❌ SEM PAYMENT ID NO BANCO');

        // Buscar customer ID do cliente
        const campoId = campoIdAsaas(cr.Centro_Custo || cr.Empresa);
        const clienteResult = await pool.query(`
          SELECT "${campoId}" as customer_id
          FROM "Cliente"
          WHERE "Codigo" = $1
        `, [cr.Código_Cliente]);

        if (clienteResult.rows.length === 0 || !clienteResult.rows[0].customer_id) {
          console.log('⚠️  Cliente sem Customer ID Asaas cadastrado');
          console.log('❌ SEM COBRANÇA NO ASAAS');
          semCobranca++;
          continue;
        }

        const customerId = clienteResult.rows[0].customer_id;
        console.log(`Customer ID Asaas: ${customerId}`);

        // Buscar API Key
        const apiKey = await buscarApiKey(cr.Centro_Custo || cr.Empresa);

        if (!apiKey) {
          console.log('⚠️  API Key não encontrada');
          console.log('❌ SEM COBRANÇA NO ASAAS (não foi possível verificar)');
          semCobranca++;
          continue;
        }

        // Buscar cobranças do cliente no Asaas
        console.log('🔍 Buscando cobranças no Asaas...');

        const valor = parseFloat(cr.Valor).toFixed(2);
        const vencimento = cr.Data_Vencimento?.toISOString().split('T')[0];

        const payments = await consultarAsaas(
          apiKey,
          `/payments?customer=${customerId}&dueDate=${vencimento}`
        );

        if (!payments || !payments.data || payments.data.length === 0) {
          console.log('❌ SEM COBRANÇA NO ASAAS');
          semCobranca++;
          continue;
        }

        // Verificar se tem cobrança com o mesmo valor
        const cobrancaMesmoValor = payments.data.find(p =>
          parseFloat(p.value).toFixed(2) === valor
        );

        if (cobrancaMesmoValor) {
          console.log(`✅ ENCONTRADA COBRANÇA NO ASAAS`);
          console.log(`   - Payment ID: ${cobrancaMesmoValor.id}`);
          console.log(`   - Status: ${cobrancaMesmoValor.status}`);
          console.log(`   - Valor: R$ ${cobrancaMesmoValor.value}`);
          console.log(`   ⚠️  MAS PAYMENT ID NÃO ESTÁ NO BANCO!`);
          comCobranca++;
        } else {
          console.log(`⚠️  Cliente tem cobranças na data, mas nenhuma com valor R$ ${valor}`);
          console.log(`   Cobranças encontradas: ${payments.data.length}`);
          payments.data.forEach(p => {
            console.log(`   - ${p.id}: R$ ${p.value} (${p.status})`);
          });
          console.log('❌ SEM COBRANÇA COM ESTE VALOR');
          semCobranca++;
        }
      }

      // Aguardar 500ms entre consultas (rate limit)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 RESUMO:\n');
    console.log(`Total verificado: ${IDS_DUPLICADOS.length}`);
    console.log(`✅ COM cobrança Asaas: ${comCobranca}`);
    console.log(`❌ SEM cobrança Asaas: ${semCobranca}`);

    console.log('\n💡 PRÓXIMOS PASSOS:');
    console.log('   - Registros COM cobrança: manter e renumerar código');
    console.log('   - Registros SEM cobrança: podem ser excluídos ou renumerados\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
