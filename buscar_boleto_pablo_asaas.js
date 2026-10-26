// ============================================================
// buscar_boleto_pablo_asaas.js — V.2610061530
// Buscar boleto do PABLO no Asaas usando customer_id da IMOBEM
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function buscarBoleto() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        // Buscar API Keys de ambas as empresas
        const queryApiKeys = `
            SELECT "Codigo", "Descrição", "API_Key"
            FROM "Centros_Custos"
            WHERE "Codigo" IN (6, 4, 8)
            ORDER BY "Codigo"
        `;

        const resultApiKeys = await client.query(queryApiKeys);

        console.log('🔑 API KEYS DISPONÍVEIS:\n');
        resultApiKeys.rows.forEach(cc => {
            console.log(`   Código ${cc.Codigo} (${cc.Descrição}): ${cc.API_Key ? 'Configurada' : 'NÃO configurada'}`);
        });

        const apiKeySummer = resultApiKeys.rows.find(r => r.Codigo === 6)?.API_Key;
        const apiKeyImobem = resultApiKeys.rows.find(r => r.Codigo === 4)?.API_Key;

        console.log('\n═'.repeat(80));
        console.log('BUSCANDO BOLETO DO PABLO ARAUJO');
        console.log('═'.repeat(80) + '\n');

        const customerId = 'cus_000200158030'; // Customer ID da IMOBEM
        const valor = 550.44;
        const vencimento = '2026-10-06';

        // Tentar primeiro com API da SUMMER
        if (apiKeySummer) {
            console.log('1️⃣ Tentando com API da SUMMER...\n');

            const url1 = `https://www.asaas.com/api/v3/payments?customer=${customerId}&dueDate=${vencimento}&value=${valor}`;

            const response1 = await fetch(url1, {
                headers: { 'access_token': apiKeySummer }
            });

            if (response1.ok) {
                const data1 = await response1.json();
                console.log(`   Encontrados: ${data1.data?.length || 0} pagamento(s)\n`);

                if (data1.data && data1.data.length > 0) {
                    data1.data.forEach(p => {
                        console.log(`   Payment ID: ${p.id}`);
                        console.log(`   Valor: R$ ${p.value}`);
                        console.log(`   Vencimento: ${p.dueDate}`);
                        console.log(`   Status: ${p.status}`);
                        console.log(`   Invoice URL: ${p.invoiceUrl || 'N/A'}\n`);
                    });
                }
            } else {
                console.log(`   Erro: ${response1.status}\n`);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Tentar com API da IMOBEM
        if (apiKeyImobem) {
            console.log('2️⃣ Tentando com API da IMOBEM...\n');

            const url2 = `https://www.asaas.com/api/v3/payments?customer=${customerId}&dueDate=${vencimento}&value=${valor}`;

            const response2 = await fetch(url2, {
                headers: { 'access_token': apiKeyImobem }
            });

            if (response2.ok) {
                const data2 = await response2.json();
                console.log(`   Encontrados: ${data2.data?.length || 0} pagamento(s)\n`);

                if (data2.data && data2.data.length > 0) {
                    data2.data.forEach(p => {
                        console.log(`   Payment ID: ${p.id}`);
                        console.log(`   Valor: R$ ${p.value}`);
                        console.log(`   Vencimento: ${p.dueDate}`);
                        console.log(`   Status: ${p.status}`);
                        console.log(`   Invoice URL: ${p.invoiceUrl || 'N/A'}`);
                        console.log(`   External Reference: ${p.externalReference || 'N/A'}\n`);

                        if (p.invoiceUrl) {
                            console.log('   ✅ LINK ENCONTRADO! Atualizando banco...\n');

                            const queryUpdate = `
                                UPDATE "Contas_Receber"
                                SET "agendamento_obs" = $1
                                WHERE "ID" = 50193
                                RETURNING "ID", "agendamento_obs"
                            `;

                            client.query(queryUpdate, [p.invoiceUrl]).then(resultUpdate => {
                                console.log(`   ✅ ATUALIZADO!`);
                                console.log(`   ID: ${resultUpdate.rows[0].ID}`);
                                console.log(`   Novo link: ${resultUpdate.rows[0].agendamento_obs}\n`);
                            });
                        }
                    });
                }
            } else {
                console.log(`   Erro: ${response2.status}\n`);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Buscar últimos pagamentos do cliente (sem filtros)
        console.log('3️⃣ Buscando TODOS os pagamentos do cliente na IMOBEM...\n');

        if (apiKeyImobem) {
            const url3 = `https://www.asaas.com/api/v3/payments?customer=${customerId}&limit=50`;

            const response3 = await fetch(url3, {
                headers: { 'access_token': apiKeyImobem }
            });

            if (response3.ok) {
                const data3 = await response3.json();
                console.log(`   Total de pagamentos: ${data3.data?.length || 0}\n`);

                if (data3.data && data3.data.length > 0) {
                    console.log('   Filtrando por valor próximo a R$ 550,44:\n');

                    const valorEsperado = 550.44;
                    const pagamentosProximos = data3.data.filter(p => {
                        const diff = Math.abs(parseFloat(p.value) - valorEsperado);
                        return diff < 50; // Diferença menor que R$ 50
                    });

                    pagamentosProximos.forEach(p => {
                        console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                        console.log(`   Payment ID: ${p.id}`);
                        console.log(`   Valor: R$ ${p.value}`);
                        console.log(`   Vencimento: ${p.dueDate}`);
                        console.log(`   Status: ${p.status}`);
                        console.log(`   Invoice URL: ${p.invoiceUrl || 'N/A'}`);
                        console.log(`   External Reference: ${p.externalReference || 'N/A'}\n`);
                    });
                }
            }
        }

        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

buscarBoleto();
