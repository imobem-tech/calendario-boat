// ============================================================
// auditoria_completa_desde_junho.js — V.2610061605
// Auditoria COMPLETA: Todas as contas desde 01/06/2026
// Verifica: externalReference e link do boleto no Asaas
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

// Mapeamento Centro_Custo → campo customer_id
function getCampoCustomerId(centroCusto) {
    const map = { 6: 'Cliente_ID_tab_6', 8: 'Cliente_ID_tab_8', 9: 'Cliente_ID_tab_9', 4: 'Cliente_ID_tab_8' };
    return map[Number(centroCusto)] || 'Cliente_ID_tab_8';
}

async function buscarPagamentoAsaas(apiKey, customerId, dueDate, value) {
    try {
        const url = `https://www.asaas.com/api/v3/payments?customer=${customerId}&dueDate=${dueDate}&value=${value}`;
        const response = await fetch(url, {
            headers: { 'access_token': apiKey, 'Content-Type': 'application/json' }
        });

        if (!response.ok) return null;
        const data = await response.json();
        return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        return null;
    }
}

async function auditoriaCompleta() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('AUDITORIA COMPLETA - DESDE 01/06/2026');
        console.log('═'.repeat(80) + '\n');

        // Buscar API Keys
        const queryApiKeys = `
            SELECT "Codigo", "Descrição", "API_Key"
            FROM "Centros_Custos"
            WHERE "Codigo" IN (4, 6, 8, 9)
        `;
        const resultApiKeys = await client.query(queryApiKeys);
        const apiKeys = {};
        resultApiKeys.rows.forEach(row => {
            apiKeys[row.Codigo] = { empresa: row.Descrição, apiKey: row.API_Key };
        });

        // Buscar contas desde 01/06/2026
        const queryContas = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Descrição" as descricao,
                cr."Código_Cliente",
                cr."Valor",
                cr."Data_Vencimento",
                cr."Data_Pagamento",
                cr."agendamento_obs",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                c."Cliente_Nome",
                c."Cliente_ID_tab_6",
                c."Cliente_ID_tab_8",
                c."Cliente_ID_tab_9"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Data_Conta" >= '2026-06-01'::date
            ORDER BY cr."Data_Conta", cr."ID"
        `;

        const result = await client.query(queryContas);
        console.log(`📊 Total de contas: ${result.rows.length}\n`);
        console.log('Iniciando verificação (isso pode levar alguns minutos)...\n');

        const problemas = [];
        let contadorVerificadas = 0;
        let contadorOk = 0;

        for (const conta of result.rows) {
            contadorVerificadas++;

            // Progresso a cada 50 contas
            if (contadorVerificadas % 50 === 0) {
                console.log(`   Verificadas: ${contadorVerificadas}/${result.rows.length}...`);
            }

            const centroCusto = parseInt(conta.Centro_Custo);
            const apiKeyInfo = apiKeys[centroCusto];

            if (!apiKeyInfo || !apiKeyInfo.apiKey) {
                problemas.push({
                    id: conta.ID,
                    codigo: conta.Codigo,
                    cliente: conta.Cliente_Nome,
                    tipo: 'SEM_API_KEY',
                    descricao: `Centro ${centroCusto} sem API Key`
                });
                continue;
            }

            // Obter customer_id
            const campoId = getCampoCustomerId(centroCusto);
            let customerId = null;
            if (campoId === 'Cliente_ID_tab_6') customerId = conta.Cliente_ID_tab_6;
            else if (campoId === 'Cliente_ID_tab_8') customerId = conta.Cliente_ID_tab_8;
            else if (campoId === 'Cliente_ID_tab_9') customerId = conta.Cliente_ID_tab_9;

            if (!customerId) {
                problemas.push({
                    id: conta.ID,
                    codigo: conta.Codigo,
                    cliente: conta.Cliente_Nome,
                    tipo: 'SEM_CUSTOMER_ID',
                    descricao: 'Cliente não tem customer_id no campo correto'
                });
                continue;
            }

            // Buscar no Asaas
            const dueDate = conta.Data_Vencimento?.toISOString().split('T')[0];
            const value = parseFloat(conta.Valor).toFixed(2);

            const payment = await buscarPagamentoAsaas(apiKeyInfo.apiKey, customerId, dueDate, value);

            if (!payment) {
                problemas.push({
                    id: conta.ID,
                    codigo: conta.Codigo,
                    cliente: conta.Cliente_Nome,
                    valor: value,
                    vencimento: dueDate,
                    tipo: 'NAO_ENCONTRADO_ASAAS',
                    descricao: 'Pagamento não encontrado no Asaas'
                });
                continue;
            }

            // Verificar externalReference
            if (payment.externalReference !== conta.Codigo.toString()) {
                problemas.push({
                    id: conta.ID,
                    codigo: conta.Codigo,
                    cliente: conta.Cliente_Nome,
                    paymentId: payment.id,
                    externalRefAtual: payment.externalReference,
                    externalRefEsperado: conta.Codigo.toString(),
                    tipo: 'EXTERNAL_REF_INCORRETO',
                    descricao: `ExternalRef: ${payment.externalReference} ≠ ${conta.Codigo}`
                });
            }

            // Verificar link do boleto
            if (payment.invoiceUrl) {
                if (!conta.agendamento_obs) {
                    problemas.push({
                        id: conta.ID,
                        codigo: conta.Codigo,
                        cliente: conta.Cliente_Nome,
                        paymentId: payment.id,
                        linkCorreto: payment.invoiceUrl,
                        tipo: 'LINK_VAZIO',
                        descricao: 'Campo agendamento_obs está vazio'
                    });
                } else if (conta.agendamento_obs !== payment.invoiceUrl) {
                    problemas.push({
                        id: conta.ID,
                        codigo: conta.Codigo,
                        cliente: conta.Cliente_Nome,
                        paymentId: payment.id,
                        linkAtual: conta.agendamento_obs,
                        linkCorreto: payment.invoiceUrl,
                        tipo: 'LINK_INCORRETO',
                        descricao: 'Link do boleto não corresponde'
                    });
                }
            }

            // Se chegou aqui sem problemas, está OK
            if (!problemas.some(p => p.id === conta.ID)) {
                contadorOk++;
            }

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        console.log(`\n✅ Verificação concluída!\n`);

        // ============================================================
        // RELATÓRIO
        // ============================================================
        console.log('═'.repeat(80));
        console.log('📊 RESUMO DA AUDITORIA');
        console.log('═'.repeat(80) + '\n');

        console.log(`Total verificado: ${contadorVerificadas}`);
        console.log(`✅ Sem problemas: ${contadorOk}`);
        console.log(`⚠️  Com problemas: ${problemas.length}\n`);

        if (problemas.length > 0) {
            // Distribuição por tipo
            const porTipo = {};
            problemas.forEach(p => {
                porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
            });

            console.log('DISTRIBUIÇÃO POR TIPO:\n');
            Object.entries(porTipo).forEach(([tipo, qtd]) => {
                console.log(`   ${tipo}: ${qtd}`);
            });

            console.log('\n' + '═'.repeat(80));
            console.log('📋 LISTA DE PROBLEMAS (primeiros 50)');
            console.log('═'.repeat(80) + '\n');

            problemas.slice(0, 50).forEach((p, idx) => {
                console.log(`[${idx + 1}] ID ${p.id} - Código ${p.codigo}`);
                console.log(`    Cliente: ${p.cliente || 'N/A'}`);
                console.log(`    Tipo: ${p.tipo}`);
                console.log(`    Detalhe: ${p.descricao}`);
                if (p.paymentId) console.log(`    Payment: ${p.paymentId}`);
                if (p.linkCorreto) console.log(`    Link correto: ${p.linkCorreto}`);
                console.log('');
            });

            if (problemas.length > 50) {
                console.log(`... e mais ${problemas.length - 50} problema(s)\n`);
            }

            // Salvar relatório completo em arquivo
            const relatorio = {
                data: new Date().toISOString(),
                periodo: '01/06/2026 - ' + new Date().toLocaleDateString('pt-BR'),
                total_verificado: contadorVerificadas,
                sem_problemas: contadorOk,
                com_problemas: problemas.length,
                distribuicao: porTipo,
                problemas: problemas
            };

            const nomeArquivo = `AUDITORIA_COMPLETA_${new Date().toISOString().split('T')[0]}.json`;
            fs.writeFileSync(nomeArquivo, JSON.stringify(relatorio, null, 2), 'utf8');
            console.log(`📄 Relatório completo salvo: ${nomeArquivo}\n`);
        }

        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

auditoriaCompleta();
