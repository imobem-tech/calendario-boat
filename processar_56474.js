// ============================================================
// Processar Código 56474 - Teste - V.2609171625
// Tolerância: aceita até 5% de diferença no valor, avisa quando maior
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

async function processar56474() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        const codigo = 56474;

        console.log('═'.repeat(80));
        console.log(`PROCESSAMENTO DO CÓDIGO ${codigo}`);
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
                cc."Codigo" as centro_codigo,
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

        // Mostrar dados antes de processar
        contas.forEach((conta, idx) => {
            console.log(`[${idx + 1}] ID ${conta.ID} - ${conta.Cliente_Nome}`);
            console.log(`    Empresa: ${conta.empresa}`);
            console.log(`    Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
            console.log(`    Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);
            console.log(`    Total atual: R$ ${parseFloat(conta.Total).toFixed(2)}`);
            console.log(`    Data_Pagamento: ${conta.Data_Pagamento || 'NULL'}`);
        });

        console.log('\n' + '─'.repeat(80) + '\n');
        console.log('Pressione Ctrl+C para cancelar ou aguarde 3 segundos...\n');
        await delay(3000);

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

            // Determinar customer_id pelo Centro_Custo
            let customerId = '';
            const centroCodigo = parseInt(conta.centro_codigo);

            if (centroCodigo === 6) {
                customerId = conta.Cliente_ID_tab_6 || '';
                console.log(`   → Centro_Custo 6 → Cliente_ID_tab_6: ${customerId || '❌ SEM'}\n`);
            } else if (centroCodigo === 8) {
                customerId = conta.Cliente_ID_tab_8 || '';
                console.log(`   → Centro_Custo 8 → Cliente_ID_tab_8: ${customerId || '❌ SEM'}\n`);
            } else if (centroCodigo === 9) {
                customerId = conta.Cliente_ID_tab_9 || '';
                console.log(`   → Centro_Custo 9 → Cliente_ID_tab_9: ${customerId || '❌ SEM'}\n`);
            } else {
                console.log(`   → Centro_Custo ${centroCodigo} → ❌ NÃO MAPEADO\n`);
            }

            // PASSO 1: BUSCAR NO ASAAS
            console.log('🔍 PASSO 1: Buscando no Asaas...\n');

            let paymentEncontrado = null;

            if (customerId && conta.token) {
                try {
                    await delay(300);

                    const vencimento = conta.Data_Vencimento?.toISOString().split('T')[0];
                    const valor = parseFloat(conta.Valor);

                    console.log(`   URL: /api/v3/payments?customer=${customerId}&dueDate[ge]=${vencimento}&dueDate[le]=${vencimento}&limit=100`);

                    const payments = await consultarAsaas(
                        `payments?customer=${customerId}&dueDate[ge]=${vencimento}&dueDate[le]=${vencimento}&limit=100`,
                        conta.token
                    );

                    if (payments.data && payments.data.length > 0) {
                        console.log(`   Cobranças encontradas: ${payments.data.length}\n`);

                        // Aceitar até 5% de diferença
                        const tolerancia = valor * 0.05;
                        const match = payments.data.find(p =>
                            Math.abs(parseFloat(p.value) - valor) <= tolerancia
                        );

                        if (match) {
                            paymentEncontrado = match;
                            const valorAsaas = parseFloat(match.value);
                            const diferenca = Math.abs(valorAsaas - valor);
                            const percentual = (diferenca / valor * 100);

                            console.log(`   ✅ ENCONTRADO!`);
                            console.log(`      Payment ID: ${match.id}`);
                            console.log(`      Customer: ${match.customer}`);
                            console.log(`      Status: ${match.status}`);
                            console.log(`      Valor CR: R$ ${valor.toFixed(2)}`);
                            console.log(`      Valor Asaas: R$ ${valorAsaas.toFixed(2)}`);

                            if (diferenca > 0.01) {
                                console.log(`      ⚠️  DIFERENÇA: R$ ${diferenca.toFixed(2)} (${percentual.toFixed(2)}%)`);
                            }

                            console.log(`      Pago em: ${match.paymentDate || 'NÃO PAGO'}`);
                            console.log(`      externalReference: ${match.externalReference || 'N/A'}\n`);
                        } else {
                            console.log(`   ⚠️  Não encontrado com valor compatível (tolerância 5%)`);
                            console.log(`   Valor esperado: R$ ${valor.toFixed(2)} ± R$ ${tolerancia.toFixed(2)}`);
                            console.log(`   Valores encontrados: ${payments.data.map(p => 'R$ ' + parseFloat(p.value).toFixed(2)).join(', ')}\n`);
                        }
                    } else {
                        console.log(`   ⚠️  Nenhuma cobrança encontrada\n`);
                    }

                } catch (error) {
                    console.log(`   ❌ Erro ao buscar: ${error.message}\n`);
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
                cliente: conta.Cliente_Nome,
                payment: paymentEncontrado,
                situacao: paymentEncontrado && paymentEncontrado.status === 'RECEIVED' ? 'PAGO' : 'NÃO PAGO'
            });

            novoCodigo++;
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
        console.log('✅ CÓDIGO 56474 PROCESSADO COMPLETAMENTE!');
        console.log('═'.repeat(80) + '\n');

        console.log('📊 RESUMO:\n');
        resultados.forEach(r => {
            console.log(`   ID ${r.id}: ${r.codigoAntigo} → ${r.codigoNovo} (${r.situacao}) - ${r.cliente}`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Desconectado do banco');
    }
}

processar56474();
