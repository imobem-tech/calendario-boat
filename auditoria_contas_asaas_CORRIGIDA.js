// ============================================================
// auditoria_contas_asaas_CORRIGIDA.js — V.2610061600
// Auditoria CORRETA: Mapeamento correto de Centro_Custo → tab
// Centro 6 → tab_6, Centro 8 → tab_8, Centro 9 → tab_9
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

// Mapeamento CORRETO (baseado no código wpp/asaas.js)
function getCampoCustomerId(centroCusto) {
    const map = {
        6: 'Cliente_ID_tab_6',
        8: 'Cliente_ID_tab_8',
        9: 'Cliente_ID_tab_9',
        4: 'Cliente_ID_tab_8' // Default conforme código
    };
    return map[Number(centroCusto)] || 'Cliente_ID_tab_8';
}

async function auditoriaCorrigida() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('AUDITORIA CORRIGIDA - CONTAS SEM CADASTRO NO ASAAS');
        console.log('═'.repeat(80) + '\n');

        // Buscar contas desde 01/10/2026 com dados completos
        const query = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Descrição" as descricao,
                cr."Código_Cliente",
                cr."Valor",
                cr."Data_Vencimento",
                cr."Data_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                c."Cliente_Nome",
                c."Cliente_ID_tab_6",
                c."Cliente_ID_tab_8",
                c."Cliente_ID_tab_9"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Data_Conta" >= '2026-10-01'::date
            ORDER BY cr."Centro_Custo", c."Cliente_Nome", cr."Data_Vencimento"
        `;

        const result = await client.query(query);
        console.log(`📊 Total de contas desde 01/10/2026: ${result.rows.length}\n`);

        const contasSemCustomerId = [];

        result.rows.forEach(conta => {
            const centroCusto = parseInt(conta.Centro_Custo);
            const campoId = getCampoCustomerId(centroCusto);

            // Verificar se tem customer_id no campo correto
            let customerId = null;
            if (campoId === 'Cliente_ID_tab_6') customerId = conta.Cliente_ID_tab_6;
            else if (campoId === 'Cliente_ID_tab_8') customerId = conta.Cliente_ID_tab_8;
            else if (campoId === 'Cliente_ID_tab_9') customerId = conta.Cliente_ID_tab_9;

            if (!customerId) {
                contasSemCustomerId.push({
                    ...conta,
                    campo_esperado: campoId
                });
            }
        });

        console.log(`⚠️  Contas SEM customer_id: ${contasSemCustomerId.length}\n`);

        if (contasSemCustomerId.length > 0) {
            // Agrupar por centro de custo
            const porCentroCusto = {};
            contasSemCustomerId.forEach(conta => {
                const cc = conta.Centro_Custo;
                if (!porCentroCusto[cc]) {
                    porCentroCusto[cc] = [];
                }
                porCentroCusto[cc].push(conta);
            });

            Object.entries(porCentroCusto).forEach(([centroCusto, contas]) => {
                const empresaNome = contas[0].empresa || `Centro ${centroCusto}`;
                const campoEsperado = contas[0].campo_esperado;

                console.log('═'.repeat(80));
                console.log(`🏢 ${empresaNome} (Centro Custo: ${centroCusto})`);
                console.log(`   Campo esperado: ${campoEsperado}`);
                console.log(`   Total: ${contas.length} conta${contas.length > 1 ? 's' : ''}`);
                console.log('═'.repeat(80) + '\n');

                // Agrupar por cliente
                const porCliente = {};
                contas.forEach(conta => {
                    const cliente = conta.Cliente_Nome || 'SEM NOME';
                    if (!porCliente[cliente]) {
                        porCliente[cliente] = [];
                    }
                    porCliente[cliente].push(conta);
                });

                Object.entries(porCliente).forEach(([nomeCliente, contasCliente]) => {
                    const totalCliente = contasCliente.reduce((sum, c) => sum + parseFloat(c.Valor || 0), 0);

                    console.log(`👤 ${nomeCliente} (${contasCliente.length} conta${contasCliente.length > 1 ? 's' : ''})`);
                    console.log(`    Código Cliente: ${contasCliente[0].Código_Cliente}\n`);

                    contasCliente.forEach((conta, i) => {
                        const status = conta.Data_Pagamento ? '✅ PAGO' : '⏳ ABERTO';
                        const vencimento = conta.Data_Vencimento
                            ? new Date(conta.Data_Vencimento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})
                            : 'N/A';

                        console.log(`    [${i + 1}] ID ${conta.ID} | Código ${conta.Codigo}`);
                        console.log(`        Valor: R$ ${parseFloat(conta.Valor).toFixed(2)} | Vencimento: ${vencimento} | ${status}\n`);
                    });

                    console.log(`    💰 Total: R$ ${totalCliente.toFixed(2)}\n`);
                });
            });
        } else {
            console.log('✅ TODOS OS CLIENTES ESTÃO CADASTRADOS NO ASAAS!\n');
        }

        console.log('═'.repeat(80));
        console.log('📊 RESUMO');
        console.log('═'.repeat(80) + '\n');

        console.log(`Total de contas analisadas: ${result.rows.length}`);
        console.log(`Contas SEM customer_id: ${contasSemCustomerId.length}`);
        console.log(`Contas COM customer_id: ${result.rows.length - contasSemCustomerId.length}\n`);

        if (contasSemCustomerId.length > 0) {
            const totalSemCadastro = contasSemCustomerId.reduce((sum, c) => sum + parseFloat(c.Valor || 0), 0);
            console.log(`💰 Valor total sem cadastro: R$ ${totalSemCadastro.toFixed(2)}\n`);
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

auditoriaCorrigida();
