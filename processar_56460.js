// ============================================================
// Processar Código 56460 - Nova Metodologia - V.2609171612
// Para cada conta: busca Asaas → atualiza CR → reatribui → sync Asaas
// CORREÇÃO: dueDate[ge]/[le] (intervalo) ao invés de dueDate simples
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import https from 'https';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

function consultarAsaas(path, apiKey, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.asaas.com',
            port: 443,
            path: `/api/v3/${path}`,
            method: method,
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
            reject(new Error('Timeout'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processar56460() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        const codigo = 56460;

        console.log('═'.repeat(80));
        console.log(`PROCESSAMENTO DO CÓDIGO ${codigo} - NOVA METODOLOGIA`);
        console.log('═'.repeat(80) + '\n');

        // Buscar contas do código duplicado
        const queryContas = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Documento",
                cr."Código_Cliente",
                c."Cliente_Nome",
                c."Cliente_ID_tab_6",
                c."Cliente_ID_tab_8",
                c."Cliente_ID_tab_9",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observações",
                cr."Observacões_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                cc."API_Key" as token
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Codigo" = $1
            ORDER BY cr."ID"
        `;

        const resultContas = await client.query(queryContas, [codigo]);
        const contas = resultContas.rows;

        console.log(`📋 Contas encontradas: ${contas.length}\n`);

        // Buscar MAX(Codigo) para reatribuição
        const queryMax = `SELECT MAX("Codigo") as max_codigo FROM "Contas_Receber"`;
        const resultMax = await client.query(queryMax);
        let novoCodigo = resultMax.rows[0].max_codigo + 1;

        const resultados = [];

        // PROCESSAR CADA CONTA
        for (const conta of contas) {
            console.log('═'.repeat(80));
            console.log(`ID ${conta.ID} - ${conta.Cliente_Nome}`);
            console.log('═'.repeat(80));
            console.log(`   Empresa: ${conta.empresa}`);
            console.log(`   Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
            console.log(`   Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}\n`);

            // Coletar TODOS os customer_ids disponíveis do cliente
            const customerIds = [
                conta.Cliente_ID_tab_6,
                conta.Cliente_ID_tab_8,
                conta.Cliente_ID_tab_9
            ].filter(id => id && id !== '');

            console.log(`   Customer IDs disponíveis: ${customerIds.length > 0 ? customerIds.join(', ') : '❌ NENHUM'}\n`);

            // PASSO 1: BUSCAR NO ASAAS
            console.log('🔍 PASSO 1: Buscando no Asaas...\n');

            let paymentEncontrado = null;

            if (customerIds.length > 0 && conta.token) {
                const vencimento = conta.Data_Vencimento?.toISOString().split('T')[0];
                const valor = parseFloat(conta.Valor);

                // Buscar com CADA customer_id até encontrar
                for (const customerId of customerIds) {
                    try {
                        await delay(300);

                        console.log(`   🔍 Tentando customer ${customerId}...`);

                        const payments = await consultarAsaas(
                            `payments?customer=${customerId}&dueDate[ge]=${vencimento}&dueDate[le]=${vencimento}&limit=100`,
                            conta.token
                        );

                        if (payments.data && payments.data.length > 0) {
                            const match = payments.data.find(p =>
                                Math.abs(parseFloat(p.value) - valor) < 0.01
                            );

                            if (match) {
                                paymentEncontrado = match;
                                console.log(`      ✅ ENCONTRADO!`);
                                console.log(`      Payment ID: ${match.id}`);
                                console.log(`      Customer: ${customerId}`);
                                console.log(`      Status: ${match.status}`);
                                console.log(`      Valor: R$ ${parseFloat(match.value).toFixed(2)}`);
                                console.log(`      Pago em: ${match.paymentDate || 'NÃO PAGO'}\n`);
                                break; // Encontrou, para de buscar
                            }
                        }

                    } catch (error) {
                        console.log(`      ⚠️  Erro: ${error.message}`);
                    }
                }

                if (!paymentEncontrado) {
                    console.log(`   ❌ Não encontrado em nenhum customer_id\n`);
                }

            } else {
                console.log(`   ⚠️  Sem customer_id ou token - não pode buscar\n`);
            }

            // PASSO 2: ATUALIZAR CR COM DADOS REAIS OU LIMPAR
            console.log('🔄 PASSO 2: Atualizando CR...\n');

            if (paymentEncontrado && paymentEncontrado.status === 'RECEIVED' && paymentEncontrado.paymentDate) {
                // PAGA - Registrar dados reais
                const dataPagamento = paymentEncontrado.paymentDate;
                const valorRecebido = parseFloat(paymentEncontrado.value);
                const observacao = `Asaas_${paymentEncontrado.paymentDate}_payment_${paymentEncontrado.id}`;

                await client.query(`
                    UPDATE "Contas_Receber"
                    SET
                        "Data_Pagamento" = $2,
                        "Total" = $3,
                        "Portador" = $4,
                        "Observacões_Pagamento" = $5
                    WHERE "ID" = $1
                `, [conta.ID, dataPagamento, valorRecebido, paymentEncontrado.id, observacao]);

                console.log(`   ✅ ATUALIZADO com dados do Asaas (PAGO)\n`);

            } else {
                // NÃO PAGA OU NÃO ENCONTRADA - Limpar baixa
                const obsAtual = conta.Observações || '';
                const obsPagamento = conta.Observacões_Pagamento || '';
                const novaObs = obsAtual ? `${obsAtual}\n${obsPagamento}` : obsPagamento;

                await client.query(`
                    UPDATE "Contas_Receber"
                    SET
                        "Data_Pagamento" = NULL,
                        "Total" = 0,
                        "Observações" = $2
                    WHERE "ID" = $1
                `, [conta.ID, novaObs]);

                console.log(`   ✅ LIMPO (não pago ou não encontrado)\n`);
            }

            resultados.push({
                id: conta.ID,
                codigoAntigo: conta.Codigo,
                codigoNovo: novoCodigo,
                payment: paymentEncontrado,
                situacao: paymentEncontrado && paymentEncontrado.status === 'RECEIVED' ? 'PAGO' : 'NÃO PAGO'
            });

            novoCodigo++; // Incrementar para próxima conta
        }

        // PASSO 3: REATRIBUIR CÓDIGOS (TODAS)
        console.log('═'.repeat(80));
        console.log('🔢 PASSO 3: Reatribuindo códigos para TODAS as contas...\n');

        for (const resultado of resultados) {
            await client.query(`
                UPDATE "Contas_Receber"
                SET "Codigo" = $2
                WHERE "ID" = $1
            `, [resultado.id, resultado.codigoNovo]);

            console.log(`   ✅ ID ${resultado.id}: ${resultado.codigoAntigo} → ${resultado.codigoNovo}`);
        }

        console.log('\n');

        // PASSO 4: ATUALIZAR externalReference no Asaas (TODAS que tiverem payment)
        console.log('═'.repeat(80));
        console.log('🔄 PASSO 4: Atualizando externalReference no Asaas...\n');

        for (const resultado of resultados) {
            if (resultado.payment) {
                const conta = contas.find(c => c.ID === resultado.id);

                try {
                    await delay(300);

                    await consultarAsaas(
                        `payments/${resultado.payment.id}`,
                        conta.token,
                        'PUT',
                        { externalReference: resultado.codigoNovo.toString() }
                    );

                    console.log(`   ✅ ID ${resultado.id}: Payment ${resultado.payment.id} → externalRef ${resultado.codigoNovo}`);

                } catch (error) {
                    console.log(`   ❌ ID ${resultado.id}: Erro - ${error.message}`);
                }
            } else {
                console.log(`   ⏭️  ID ${resultado.id}: Sem payment no Asaas`);
            }
        }

        console.log('\n');
        console.log('═'.repeat(80));
        console.log('✅ CÓDIGO 56460 PROCESSADO COMPLETAMENTE!');
        console.log('═'.repeat(80) + '\n');

        console.log('📊 RESUMO:\n');
        resultados.forEach(r => {
            console.log(`   ID ${r.id}: ${r.codigoAntigo} → ${r.codigoNovo} (${r.situacao})`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Desconectado do banco');
    }
}

processar56460();
