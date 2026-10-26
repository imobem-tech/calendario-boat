// ============================================================
// Processar Lote de 5 Códigos - V.2609171635
// Códigos: 56491, 56516, 56517, 56518, 56625
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import https from 'https';
import fs from 'fs';

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

async function processarLote() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        const codigosParaProcessar = [56491, 56516, 56517, 56518, 56625];

        console.log('═'.repeat(80));
        console.log('PROCESSAMENTO DE LOTE DE 5 CÓDIGOS');
        console.log('═'.repeat(80) + '\n');
        console.log(`📋 Códigos: ${codigosParaProcessar.join(', ')}\n`);

        // Buscar MAX(Codigo) atual
        const queryMax = `SELECT MAX("Codigo") as max_codigo FROM "Contas_Receber"`;
        const resultMax = await client.query(queryMax);
        let novoCodigo = resultMax.rows[0].max_codigo + 1;

        console.log(`📊 Próximo código disponível: ${novoCodigo}\n`);

        const relatorio = {
            inicio: new Date().toISOString(),
            codigos: codigosParaProcessar,
            resultados: []
        };

        // Processar cada código
        for (let idx = 0; idx < codigosParaProcessar.length; idx++) {
            const codigo = codigosParaProcessar[idx];

            console.log('═'.repeat(80));
            console.log(`[${idx + 1}/${codigosParaProcessar.length}] CÓDIGO ${codigo}`);
            console.log('═'.repeat(80) + '\n');

            try {
                // Buscar contas do código
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

                console.log(`   📋 Contas: ${contas.length}\n`);

                const resultadosCodigo = [];

                // PROCESSAR CADA CONTA
                for (const conta of contas) {
                    console.log(`   ID ${conta.ID} - ${conta.Cliente_Nome || 'SEM NOME'}`);
                    console.log(`   Empresa: ${conta.empresa || 'N/A'} | Venc: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})} | Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);

                    // Determinar customer_id pelo Centro_Custo
                    let customerId = '';
                    const centroCodigo = parseInt(conta.centro_codigo);

                    if (centroCodigo === 6) {
                        customerId = conta.Cliente_ID_tab_6 || '';
                    } else if (centroCodigo === 8) {
                        customerId = conta.Cliente_ID_tab_8 || '';
                    } else if (centroCodigo === 9) {
                        customerId = conta.Cliente_ID_tab_9 || '';
                    }

                    // PASSO 1: BUSCAR NO ASAAS
                    let paymentEncontrado = null;

                    if (customerId && conta.token) {
                        try {
                            await delay(300);

                            const vencimento = conta.Data_Vencimento?.toISOString().split('T')[0];
                            const valor = parseFloat(conta.Valor);

                            const payments = await consultarAsaas(
                                `payments?customer=${customerId}&dueDate[ge]=${vencimento}&dueDate[le]=${vencimento}&limit=100`,
                                conta.token
                            );

                            if (payments.data && payments.data.length > 0) {
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

                                    let msg = `   ✅ ${match.status} - R$ ${valorAsaas.toFixed(2)}`;
                                    if (diferenca > 0.01) {
                                        msg += ` (dif: R$ ${diferenca.toFixed(2)} / ${percentual.toFixed(1)}%)`;
                                    }
                                    console.log(msg);
                                } else {
                                    console.log(`   ⚠️  Não encontrado (tolerância 5%)`);
                                }
                            } else {
                                console.log(`   ⚠️  Sem cobrança no Asaas`);
                            }

                        } catch (error) {
                            console.log(`   ❌ Erro: ${error.message}`);
                        }
                    } else {
                        console.log(`   ⚠️  Sem customer_id ou token`);
                    }

                    // PASSO 2: ATUALIZAR CR
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

                    } else {
                        // NÃO PAGA - Limpar baixa
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
                    }

                    resultadosCodigo.push({
                        id: conta.ID,
                        codigoAntigo: conta.Codigo,
                        codigoNovo: novoCodigo,
                        cliente: conta.Cliente_Nome,
                        payment: paymentEncontrado,
                        situacao: paymentEncontrado && paymentEncontrado.status === 'RECEIVED' ? 'PAGO' : 'NÃO PAGO'
                    });

                    novoCodigo++;
                }

                // PASSO 3: REATRIBUIR CÓDIGOS
                console.log(`\n   🔢 Reatribuindo códigos...`);
                for (const resultado of resultadosCodigo) {
                    await client.query(`
                        UPDATE "Contas_Receber"
                        SET "Codigo" = $2
                        WHERE "ID" = $1
                    `, [resultado.id, resultado.codigoNovo]);
                    console.log(`      ID ${resultado.id}: ${resultado.codigoAntigo} → ${resultado.codigoNovo}`);
                }

                // PASSO 4: ATUALIZAR externalReference
                console.log(`\n   🔄 Atualizando externalReference...`);
                for (const resultado of resultadosCodigo) {
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

                            console.log(`      ID ${resultado.id}: ✅`);

                        } catch (error) {
                            console.log(`      ID ${resultado.id}: ❌ ${error.message}`);
                        }
                    }
                }

                relatorio.resultados.push({
                    codigo: codigo,
                    contas: resultadosCodigo,
                    sucesso: true
                });

                console.log(`\n   ✅ Código ${codigo} processado!\n`);

            } catch (error) {
                console.log(`   ❌ Erro ao processar código ${codigo}: ${error.message}\n`);
                relatorio.resultados.push({
                    codigo: codigo,
                    erro: error.message,
                    sucesso: false
                });
            }
        }

        // Salvar relatório
        relatorio.fim = new Date().toISOString();
        const nomeRelatorio = `relatorio_lote5_${Date.now()}.json`;
        fs.writeFileSync(nomeRelatorio, JSON.stringify(relatorio, null, 2));

        console.log('═'.repeat(80));
        console.log('✅ LOTE PROCESSADO!');
        console.log('═'.repeat(80) + '\n');

        console.log('📊 RESUMO:\n');
        relatorio.resultados.forEach(r => {
            if (r.sucesso) {
                console.log(`   Código ${r.codigo}: ${r.contas.length} contas processadas`);
                r.contas.forEach(c => {
                    console.log(`      ID ${c.id}: ${c.codigoAntigo} → ${c.codigoNovo} (${c.situacao})`);
                });
            } else {
                console.log(`   Código ${r.codigo}: ERRO - ${r.erro}`);
            }
        });

        console.log(`\n   Relatório: ${nomeRelatorio}\n`);

    } catch (error) {
        console.error('❌ Erro fatal:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

processarLote();
