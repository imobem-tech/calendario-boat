// ============================================================
// auditoria_contas_asaas_outubro.js — V.2610061535
// Auditoria completa: Contas a Receber x Asaas (desde 01/10/2026)
// Identifica contas não cadastradas, links incorretos, etc.
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function buscarPagamentosAsaas(apiKey, filters = {}) {
    let url = 'https://www.asaas.com/api/v3/payments?limit=100';

    if (filters.customer) url += `&customer=${filters.customer}`;
    if (filters.dateCreated) url += `&dateCreated[ge]=${filters.dateCreated}`;
    if (filters.dueDate) url += `&dueDate=${filters.dueDate}`;
    if (filters.value) url += `&value=${filters.value}`;

    const response = await fetch(url, {
        headers: {
            'access_token': apiKey,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
    }

    return await response.json();
}

async function auditoriaContasAsaas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('AUDITORIA: CONTAS A RECEBER x ASAAS (desde 01/10/2026)');
        console.log('═'.repeat(80) + '\n');

        // Buscar todas as contas desde 01/10/2026
        const queryContas = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Descrição" as descricao,
                cr."Código_Cliente",
                cr."Valor",
                cr."Data_Conta",
                cr."Data_Vencimento",
                cr."Data_Pagamento",
                cr."agendamento_obs",
                cr."Observacões_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                cc."API_Key" as api_key,
                c."Cliente_Nome",
                c."Cliente_CPF",
                c."Cliente_ID_tab_6" as customer_id_allmax,
                c."Cliente_ID_tab_8" as customer_id_imobem
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Data_Conta" >= '2026-10-01'::date
            ORDER BY cr."Data_Conta", cr."ID"
        `;

        const resultContas = await client.query(queryContas);

        console.log(`📊 Total de contas desde 01/10/2026: ${resultContas.rows.length}\n`);

        // Agrupar por centro de custo
        const porCentroCusto = {};
        resultContas.rows.forEach(conta => {
            const cc = conta.Centro_Custo;
            if (!porCentroCusto[cc]) {
                porCentroCusto[cc] = [];
            }
            porCentroCusto[cc].push(conta);
        });

        const problemas = [];
        let totalVerificadas = 0;
        let totalSemCustomerId = 0;
        let totalNaoEncontradasAsaas = 0;
        let totalSemLink = 0;

        // Verificar cada centro de custo
        for (const [centroCusto, contas] of Object.entries(porCentroCusto)) {
            const empresaNome = contas[0].empresa || `Centro ${centroCusto}`;
            const apiKey = contas[0].api_key;

            console.log('═'.repeat(80));
            console.log(`🏢 EMPRESA: ${empresaNome} (Centro Custo: ${centroCusto})`);
            console.log('═'.repeat(80));
            console.log(`   Total de contas: ${contas.length}`);
            console.log(`   API Key: ${apiKey ? '✅ Configurada' : '❌ NÃO configurada'}\n`);

            if (!apiKey) {
                console.log('   ⚠️ Pulando verificação (sem API Key)\n');
                contas.forEach(c => {
                    problemas.push({
                        id: c.ID,
                        codigo: c.Codigo,
                        cliente: c.Cliente_Nome,
                        tipo: 'SEM_API_KEY',
                        descricao: `Centro de Custo ${centroCusto} sem API Key`
                    });
                });
                continue;
            }

            console.log('   Verificando contas...\n');

            for (const conta of contas) {
                totalVerificadas++;

                // Determinar customer_id
                let customerId = null;
                const cc = parseInt(centroCusto);

                if (cc === 8 || cc === 6) {
                    customerId = conta.customer_id_allmax;
                } else if (cc === 4) {
                    customerId = conta.customer_id_imobem;
                }

                // Verificação 1: Customer ID
                if (!customerId) {
                    console.log(`   ⚠️ ID ${conta.ID} - ${conta.Cliente_Nome || 'SEM NOME'}`);
                    console.log(`      Problema: SEM CUSTOMER_ID`);
                    console.log(`      Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);
                    console.log(`      Vencimento: ${conta.Data_Vencimento?.toISOString().split('T')[0]}\n`);

                    totalSemCustomerId++;
                    problemas.push({
                        id: conta.ID,
                        codigo: conta.Codigo,
                        cliente: conta.Cliente_Nome,
                        valor: conta.Valor,
                        vencimento: conta.Data_Vencimento,
                        tipo: 'SEM_CUSTOMER_ID',
                        descricao: 'Cliente não cadastrado no Asaas'
                    });
                    continue;
                }

                // Verificação 2: Buscar no Asaas
                try {
                    const dueDate = conta.Data_Vencimento?.toISOString().split('T')[0];
                    const value = parseFloat(conta.Valor).toFixed(2);

                    const resultAsaas = await buscarPagamentosAsaas(apiKey, {
                        customer: customerId,
                        dueDate: dueDate,
                        value: value
                    });

                    if (!resultAsaas.data || resultAsaas.data.length === 0) {
                        console.log(`   ⚠️ ID ${conta.ID} - ${conta.Cliente_Nome}`);
                        console.log(`      Problema: NÃO ENCONTRADO NO ASAAS`);
                        console.log(`      Valor: R$ ${value}`);
                        console.log(`      Vencimento: ${dueDate}`);
                        console.log(`      Customer: ${customerId}\n`);

                        totalNaoEncontradasAsaas++;
                        problemas.push({
                            id: conta.ID,
                            codigo: conta.Codigo,
                            cliente: conta.Cliente_Nome,
                            valor: conta.Valor,
                            vencimento: dueDate,
                            customerId: customerId,
                            tipo: 'NAO_ENCONTRADO_ASAAS',
                            descricao: 'Cobrança não existe no Asaas'
                        });
                    } else {
                        const payment = resultAsaas.data[0];

                        // Verificação 3: Link do boleto
                        if (!conta.agendamento_obs) {
                            console.log(`   ⚠️ ID ${conta.ID} - ${conta.Cliente_Nome}`);
                            console.log(`      Problema: SEM LINK DO BOLETO`);
                            console.log(`      Payment Asaas: ${payment.id}`);
                            console.log(`      Link correto: ${payment.invoiceUrl || 'N/A'}\n`);

                            totalSemLink++;
                            problemas.push({
                                id: conta.ID,
                                codigo: conta.Codigo,
                                cliente: conta.Cliente_Nome,
                                paymentId: payment.id,
                                linkCorreto: payment.invoiceUrl,
                                tipo: 'SEM_LINK',
                                descricao: 'Campo agendamento_obs vazio'
                            });
                        } else if (payment.invoiceUrl && conta.agendamento_obs !== payment.invoiceUrl) {
                            console.log(`   ⚠️ ID ${conta.ID} - ${conta.Cliente_Nome}`);
                            console.log(`      Problema: LINK INCORRETO`);
                            console.log(`      Link no banco: ${conta.agendamento_obs}`);
                            console.log(`      Link correto: ${payment.invoiceUrl}\n`);

                            problemas.push({
                                id: conta.ID,
                                codigo: conta.Codigo,
                                cliente: conta.Cliente_Nome,
                                paymentId: payment.id,
                                linkAtual: conta.agendamento_obs,
                                linkCorreto: payment.invoiceUrl,
                                tipo: 'LINK_INCORRETO',
                                descricao: 'Link não corresponde ao payment do Asaas'
                            });
                        }

                        // Verificação 4: External Reference
                        if (payment.externalReference !== conta.Codigo.toString()) {
                            console.log(`   ⚠️ ID ${conta.ID} - ${conta.Cliente_Nome}`);
                            console.log(`      Problema: EXTERNAL_REFERENCE INCORRETO`);
                            console.log(`      Payment: ${payment.id}`);
                            console.log(`      ExternalRef atual: ${payment.externalReference || 'NULL'}`);
                            console.log(`      ExternalRef esperado: ${conta.Codigo}\n`);

                            problemas.push({
                                id: conta.ID,
                                codigo: conta.Codigo,
                                cliente: conta.Cliente_Nome,
                                paymentId: payment.id,
                                externalRefAtual: payment.externalReference,
                                externalRefEsperado: conta.Codigo,
                                tipo: 'EXTERNAL_REF_INCORRETO',
                                descricao: 'ExternalReference não corresponde ao Código'
                            });
                        }
                    }

                    // Rate limit
                    await new Promise(resolve => setTimeout(resolve, 300));

                } catch (error) {
                    console.log(`   ❌ ID ${conta.ID} - Erro: ${error.message}\n`);
                    problemas.push({
                        id: conta.ID,
                        codigo: conta.Codigo,
                        cliente: conta.Cliente_Nome,
                        tipo: 'ERRO',
                        descricao: error.message
                    });
                }
            }
        }

        // ============================================================
        // RESUMO FINAL
        // ============================================================
        console.log('\n' + '═'.repeat(80));
        console.log('📊 RESUMO DA AUDITORIA');
        console.log('═'.repeat(80) + '\n');

        console.log(`Total de contas verificadas: ${totalVerificadas}`);
        console.log(`Total de problemas encontrados: ${problemas.length}\n`);

        console.log('DISTRIBUIÇÃO DOS PROBLEMAS:\n');
        const porTipo = {};
        problemas.forEach(p => {
            porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
        });

        Object.entries(porTipo).forEach(([tipo, qtd]) => {
            const emoji = {
                'SEM_CUSTOMER_ID': '👤',
                'NAO_ENCONTRADO_ASAAS': '🔍',
                'SEM_LINK': '🔗',
                'LINK_INCORRETO': '⚠️',
                'EXTERNAL_REF_INCORRETO': '🏷️',
                'SEM_API_KEY': '🔑',
                'ERRO': '❌'
            };
            console.log(`   ${emoji[tipo] || '•'} ${tipo}: ${qtd}`);
        });

        if (problemas.length > 0) {
            console.log('\n' + '═'.repeat(80));
            console.log('📋 LISTA DETALHADA DE PROBLEMAS');
            console.log('═'.repeat(80) + '\n');

            problemas.forEach((p, idx) => {
                console.log(`[${idx + 1}] ID ${p.id} - Código ${p.codigo}`);
                console.log(`    Cliente: ${p.cliente || 'N/A'}`);
                console.log(`    Tipo: ${p.tipo}`);
                console.log(`    Descrição: ${p.descricao}`);

                if (p.paymentId) console.log(`    Payment Asaas: ${p.paymentId}`);
                if (p.linkCorreto) console.log(`    Link correto: ${p.linkCorreto}`);
                if (p.externalRefEsperado) console.log(`    ExternalRef esperado: ${p.externalRefEsperado}`);

                console.log('');
            });
        }

        console.log('═'.repeat(80));
        console.log('✅ AUDITORIA CONCLUÍDA');
        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ ERRO GERAL:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

auditoriaContasAsaas();
