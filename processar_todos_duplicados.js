// ============================================================
// Processar TODOS os Códigos Duplicados - V.2609171628
// Tolerância: aceita até 5% de diferença no valor, avisa quando maior
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

async function processarTodosDuplicados() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('PROCESSAMENTO DE TODOS OS CÓDIGOS DUPLICADOS');
        console.log('═'.repeat(80) + '\n');

        // Buscar códigos duplicados
        console.log('🔍 Identificando códigos duplicados...\n');

        const queryDuplicados = `
            SELECT "Codigo", COUNT(*) as qtd
            FROM "Contas_Receber"
            GROUP BY "Codigo"
            HAVING COUNT(*) > 1
            ORDER BY "Codigo"
        `;

        const resultDuplicados = await client.query(queryDuplicados);
        const codigosDuplicados = resultDuplicados.rows;

        console.log(`📊 Códigos duplicados encontrados: ${codigosDuplicados.length}\n`);

        // Buscar MAX(Codigo) atual
        const queryMax = `SELECT MAX("Codigo") as max_codigo FROM "Contas_Receber"`;
        const resultMax = await client.query(queryMax);
        let novoCodigo = resultMax.rows[0].max_codigo + 1;

        console.log(`📊 Próximo código disponível: ${novoCodigo}\n`);

        const relatorio = {
            inicio: new Date().toISOString(),
            total_codigos: codigosDuplicados.length,
            codigos_processados: [],
            erros: []
        };

        // Processar cada código duplicado
        for (let idx = 0; idx < codigosDuplicados.length; idx++) {
            const { Codigo: codigo, qtd } = codigosDuplicados[idx];

            console.log('═'.repeat(80));
            console.log(`[${idx + 1}/${codigosDuplicados.length}] CÓDIGO ${codigo} (${qtd} contas)`);
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

                const resultadosCodigo = [];

                // PROCESSAR CADA CONTA
                for (const conta of contas) {
                    console.log(`   ID ${conta.ID} - ${conta.Cliente_Nome}`);
                    console.log(`   Empresa: ${conta.empresa}`);
                    console.log(`   Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
                    console.log(`   Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}\n`);

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

                    console.log(`   Customer ID: ${customerId || '❌ SEM'}\n`);

                    // PASSO 1: BUSCAR NO ASAAS
                    console.log('   🔍 PASSO 1: Buscando no Asaas...');

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

                                    let msg = `      ✅ ENCONTRADO - ${match.status} - R$ ${valorAsaas.toFixed(2)}`;
                                    if (diferenca > 0.01) {
                                        msg += ` (dif: R$ ${diferenca.toFixed(2)} / ${percentual.toFixed(1)}%)`;
                                    }
                                    console.log(msg);
                                } else {
                                    console.log(`      ⚠️  Não encontrado com valor compatível (tolerância 5%)`);
                                }
                            } else {
                                console.log(`      ⚠️  Nenhuma cobrança encontrada`);
                            }

                        } catch (error) {
                            console.log(`      ❌ Erro: ${error.message}`);
                        }
                    } else {
                        console.log(`      ⚠️  Sem customer_id ou token`);
                    }

                    // PASSO 2: ATUALIZAR CR
                    console.log('   🔄 PASSO 2: Atualizando CR...');

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

                        console.log(`      ✅ PAGO - atualizado`);

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

                        console.log(`      ✅ NÃO PAGO - limpo`);
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
                    console.log('');
                }

                // PASSO 3: REATRIBUIR CÓDIGOS
                console.log('   🔢 PASSO 3: Reatribuindo códigos...');

                for (const resultado of resultadosCodigo) {
                    await client.query(`
                        UPDATE "Contas_Receber"
                        SET "Codigo" = $2
                        WHERE "ID" = $1
                    `, [resultado.id, resultado.codigoNovo]);

                    console.log(`      ✅ ID ${resultado.id}: ${resultado.codigoAntigo} → ${resultado.codigoNovo}`);
                }

                console.log('');

                // PASSO 4: ATUALIZAR externalReference
                console.log('   🔄 PASSO 4: Atualizando externalReference...');

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

                            console.log(`      ✅ ID ${resultado.id}: externalRef → ${resultado.codigoNovo}`);

                        } catch (error) {
                            console.log(`      ❌ ID ${resultado.id}: ${error.message}`);
                        }
                    } else {
                        console.log(`      ⏭️  ID ${resultado.id}: Sem payment`);
                    }
                }

                relatorio.codigos_processados.push({
                    codigo: codigo,
                    contas: resultadosCodigo
                });

                console.log(`\n   ✅ Código ${codigo} processado!\n`);

            } catch (error) {
                console.log(`   ❌ Erro ao processar código ${codigo}: ${error.message}\n`);
                relatorio.erros.push({
                    codigo: codigo,
                    erro: error.message
                });
            }
        }

        // Salvar relatório
        relatorio.fim = new Date().toISOString();
        relatorio.total_processados = relatorio.codigos_processados.length;
        relatorio.total_erros = relatorio.erros.length;

        const nomeRelatorio = `relatorio_duplicados_${Date.now()}.json`;
        fs.writeFileSync(nomeRelatorio, JSON.stringify(relatorio, null, 2));

        console.log('═'.repeat(80));
        console.log('✅ PROCESSAMENTO CONCLUÍDO!');
        console.log('═'.repeat(80) + '\n');

        console.log('📊 RESUMO FINAL:\n');
        console.log(`   Total de códigos: ${relatorio.total_codigos}`);
        console.log(`   Processados com sucesso: ${relatorio.total_processados}`);
        console.log(`   Erros: ${relatorio.total_erros}`);
        console.log(`   Relatório salvo em: ${nomeRelatorio}\n`);

    } catch (error) {
        console.error('❌ Erro fatal:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

processarTodosDuplicados();
