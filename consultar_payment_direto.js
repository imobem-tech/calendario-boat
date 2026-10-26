// ============================================================
// Consultar Payment ID Direto - V.260917210
// Consulta um payment específico no Asaas para ver quem pagou
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import https from 'https';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

function consultarAsaas(path, apiKey) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.asaas.com',
            port: 443,
            path: `/api/v3/${path}`,
            method: 'GET',
            headers: {
                'access_token': apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'CalendarioAllmax/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}: ${parsed.errors?.[0]?.description || data}`));
                    } else {
                        resolve(parsed);
                    }
                }
                catch (e) { reject(new Error(`Erro ao parsear JSON: ${e.message}`)); }
            });
        });

        req.on('error', (error) => reject(error));
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Timeout na requisição'));
        });

        req.end();
    });
}

async function consultarPayment() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        const paymentId = 'pay_rpr8i7twqdbu6elw';

        console.log('═'.repeat(80));
        console.log(`CONSULTANDO PAYMENT: ${paymentId}`);
        console.log('═'.repeat(80) + '\n');

        // Buscar tokens de todas as empresas
        const queryTokens = `
            SELECT "Codigo", "Descrição", "API_Key"
            FROM "Centros_Custos"
            WHERE "API_Key" IS NOT NULL AND "API_Key" != ''
            ORDER BY "Codigo"
        `;

        const resultTokens = await client.query(queryTokens);
        console.log(`📊 Tokens encontrados: ${resultTokens.rows.length}\n`);

        let paymentEncontrado = false;
        let dadosPayment = null;

        // Tentar com cada token até encontrar
        for (const centroCusto of resultTokens.rows) {
            console.log(`🔍 Tentando com: ${centroCusto.Descrição} (Centro_Custo ${centroCusto.Codigo})...`);

            try {
                const payment = await consultarAsaas(`payments/${paymentId}`, centroCusto.API_Key);

                console.log(`   ✅ PAYMENT ENCONTRADO!\n`);
                paymentEncontrado = true;
                dadosPayment = payment;

                console.log('═'.repeat(80));
                console.log('DADOS DO PAGAMENTO:');
                console.log('═'.repeat(80) + '\n');

                console.log(`Payment ID: ${payment.id}`);
                console.log(`Customer ID: ${payment.customer}`);
                console.log(`Status: ${payment.status}`);
                console.log(`Valor: R$ ${parseFloat(payment.value).toFixed(2)}`);
                console.log(`Valor líquido: R$ ${parseFloat(payment.netValue || payment.value).toFixed(2)}`);
                console.log(`Data criação: ${payment.dateCreated}`);
                console.log(`Vencimento: ${payment.dueDate}`);
                console.log(`Data pagamento: ${payment.paymentDate || 'NÃO PAGO'}`);
                console.log(`External Reference: ${payment.externalReference || 'N/A'}`);
                console.log(`Descrição: ${payment.description || 'N/A'}`);
                console.log(`Forma pagamento: ${payment.billingType}`);
                console.log(`Installment: ${payment.installment || 'N/A'}`);

                if (payment.discount) {
                    console.log(`Desconto: R$ ${parseFloat(payment.discount.value || 0).toFixed(2)}`);
                }

                if (payment.fine) {
                    console.log(`Multa: R$ ${parseFloat(payment.fine.value || 0).toFixed(2)}`);
                }

                if (payment.interest) {
                    console.log(`Juros: R$ ${parseFloat(payment.interest.value || 0).toFixed(2)}`);
                }

                console.log(`\n🏢 Encontrado na empresa: ${centroCusto.Descrição}`);
                console.log(`   Centro_Custo: ${centroCusto.Codigo}\n`);

                // Agora buscar qual cliente é esse customer_id
                console.log('─'.repeat(80));
                console.log('IDENTIFICANDO CLIENTE:\n');

                const queryCliente = `
                    SELECT
                        "Codigo",
                        "Cliente_Nome",
                        "Cliente_CPF",
                        "Cliente_Telefone_Celular",
                        "Cliente_ID_tab_6",
                        "Cliente_ID_tab_8",
                        "Cliente_ID_tab_9"
                    FROM "Cliente"
                    WHERE "Cliente_ID_tab_6" = $1
                       OR "Cliente_ID_tab_8" = $1
                       OR "Cliente_ID_tab_9" = $1
                `;

                const resultCliente = await client.query(queryCliente, [payment.customer]);

                if (resultCliente.rows.length > 0) {
                    const cliente = resultCliente.rows[0];
                    console.log(`✅ CLIENTE ENCONTRADO:\n`);
                    console.log(`   Código: ${cliente.Codigo}`);
                    console.log(`   Nome: ${cliente.Cliente_Nome}`);
                    console.log(`   CPF: ${cliente.Cliente_CPF || 'N/A'}`);
                    console.log(`   Telefone: ${cliente.Cliente_Telefone_Celular || 'N/A'}`);
                    console.log(`   Customer_ID tab_6 (ALLMAX/SUMMER): ${cliente.Cliente_ID_tab_6 || 'vazio'}`);
                    console.log(`   Customer_ID tab_8 (IMOBEM): ${cliente.Cliente_ID_tab_8 || 'vazio'}`);
                    console.log(`   Customer_ID tab_9 (IMOBAN): ${cliente.Cliente_ID_tab_9 || 'vazio'}\n`);
                } else {
                    console.log(`❌ Cliente com Customer_ID ${payment.customer} NÃO encontrado no banco!\n`);
                }

                // Buscar as contas que foram baixadas com esse portador
                console.log('─'.repeat(80));
                console.log('CONTAS BAIXADAS COM ESTE PORTADOR:\n');

                const queryContas = `
                    SELECT
                        cr."ID",
                        cr."Codigo",
                        cr."Código_Cliente",
                        c."Cliente_Nome",
                        cr."Valor",
                        cr."Total",
                        cr."Data_Vencimento",
                        cr."Data_Pagamento",
                        cc."Descrição" as empresa
                    FROM "Contas_Receber" cr
                    LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
                    LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
                    WHERE cr."Portador" = $1
                    ORDER BY cr."ID"
                `;

                const resultContas = await client.query(queryContas, [paymentId]);

                if (resultContas.rows.length > 0) {
                    console.log(`📋 ${resultContas.rows.length} conta(s) baixada(s) com este portador:\n`);

                    resultContas.rows.forEach((conta, idx) => {
                        const valorMatch = Math.abs(parseFloat(conta.Valor) - parseFloat(payment.value)) < 1;
                        const totalMatch = Math.abs(parseFloat(conta.Total) - parseFloat(payment.value)) < 1;
                        const clienteMatch = resultCliente.rows.length > 0 &&
                                            conta.Código_Cliente === resultCliente.rows[0].Codigo;

                        console.log(`[${idx + 1}] ID: ${conta.ID} - Código: ${conta.Codigo}`);
                        console.log(`    Cliente: [${conta.Código_Cliente}] ${conta.Cliente_Nome}`);
                        console.log(`    Empresa: ${conta.empresa}`);
                        console.log(`    Valor: R$ ${parseFloat(conta.Valor).toFixed(2)} ${valorMatch ? '✅ MATCH' : ''}`);
                        console.log(`    Total: R$ ${parseFloat(conta.Total).toFixed(2)} ${totalMatch ? '✅ MATCH' : ''}`);
                        console.log(`    Cliente: ${clienteMatch ? '✅ MATCH' : '❌ DIFERENTE'}`);

                        if (valorMatch && totalMatch && clienteMatch) {
                            console.log(`    🎯 ESTA É A CONTA CORRETA!\n`);
                        } else if (!clienteMatch) {
                            console.log(`    ❌ BAIXA INCORRETA - cliente diferente!\n`);
                        } else if (!valorMatch && !totalMatch) {
                            console.log(`    ❌ BAIXA INCORRETA - valor não confere!\n`);
                        } else {
                            console.log();
                        }
                    });
                }

                break; // Encontrou, pode parar

            } catch (error) {
                console.log(`   ❌ Não encontrado: ${error.message}\n`);
            }
        }

        if (!paymentEncontrado) {
            console.log('\n❌ Payment não encontrado em nenhuma das empresas!');
            console.log('   Possibilidades:');
            console.log('   - Payment foi deletado');
            console.log('   - ID incorreto');
            console.log('   - Empresa não está cadastrada no banco\n');
        }

        console.log('═'.repeat(80));

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Desconectado do banco');
    }
}

consultarPayment();
