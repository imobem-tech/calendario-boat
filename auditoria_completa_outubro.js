// ============================================================
// auditoria_completa_outubro.js — V.2610061610
// Auditoria COMPLETA: Contas desde 01/10/2026
// Verifica: externalReference e link do boleto no Asaas
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

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

async function auditoriaOutubro() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('AUDITORIA COMPLETA - OUTUBRO 2026');
        console.log('═'.repeat(80) + '\n');

        // API Keys
        const queryApiKeys = `SELECT "Codigo", "API_Key" FROM "Centros_Custos" WHERE "Codigo" IN (4,6,8,9)`;
        const resultApiKeys = await client.query(queryApiKeys);
        const apiKeys = {};
        resultApiKeys.rows.forEach(r => { apiKeys[r.Codigo] = r.API_Key; });

        // Contas desde 01/10
        const queryContas = `
            SELECT
                cr."ID", cr."Codigo", cr."Valor", cr."Data_Vencimento",
                cr."agendamento_obs", cr."Centro_Custo",
                c."Cliente_Nome", c."Cliente_ID_tab_6", c."Cliente_ID_tab_8", c."Cliente_ID_tab_9"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            WHERE cr."Data_Conta" >= '2026-10-01'::date
            ORDER BY cr."ID"
        `;

        const result = await client.query(queryContas);
        console.log(`📊 Total: ${result.rows.length} contas\n`);

        const problemas = [];
        let ok = 0;

        for (const conta of result.rows) {
            const cc = parseInt(conta.Centro_Custo);
            const apiKey = apiKeys[cc];

            if (!apiKey) {
                problemas.push({ id: conta.ID, tipo: 'SEM_API_KEY' });
                continue;
            }

            const campoId = getCampoCustomerId(cc);
            let customerId = null;
            if (campoId === 'Cliente_ID_tab_6') customerId = conta.Cliente_ID_tab_6;
            else if (campoId === 'Cliente_ID_tab_8') customerId = conta.Cliente_ID_tab_8;
            else if (campoId === 'Cliente_ID_tab_9') customerId = conta.Cliente_ID_tab_9;

            if (!customerId) {
                problemas.push({ id: conta.ID, codigo: conta.Codigo, cliente: conta.Cliente_Nome, tipo: 'SEM_CUSTOMER_ID' });
                continue;
            }

            const dueDate = conta.Data_Vencimento?.toISOString().split('T')[0];
            const value = parseFloat(conta.Valor).toFixed(2);
            const payment = await buscarPagamentoAsaas(apiKey, customerId, dueDate, value);

            if (!payment) {
                problemas.push({ id: conta.ID, codigo: conta.Codigo, cliente: conta.Cliente_Nome, tipo: 'NAO_ENCONTRADO' });
                continue;
            }

            let temProblema = false;

            if (payment.externalReference !== conta.Codigo.toString()) {
                problemas.push({
                    id: conta.ID,
                    codigo: conta.Codigo,
                    cliente: conta.Cliente_Nome,
                    tipo: 'EXTERNAL_REF_INCORRETO',
                    paymentId: payment.id,
                    atual: payment.externalReference,
                    esperado: conta.Codigo
                });
                temProblema = true;
            }

            if (payment.invoiceUrl && conta.agendamento_obs !== payment.invoiceUrl) {
                problemas.push({
                    id: conta.ID,
                    codigo: conta.Codigo,
                    cliente: conta.Cliente_Nome,
                    tipo: conta.agendamento_obs ? 'LINK_INCORRETO' : 'LINK_VAZIO',
                    paymentId: payment.id,
                    linkAtual: conta.agendamento_obs || 'VAZIO',
                    linkCorreto: payment.invoiceUrl
                });
                temProblema = true;
            }

            if (!temProblema) ok++;

            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // RELATÓRIO
        console.log('═'.repeat(80));
        console.log('📊 RESUMO');
        console.log('═'.repeat(80) + '\n');

        console.log(`Total verificado: ${result.rows.length}`);
        console.log(`✅ OK: ${ok}`);
        console.log(`⚠️  Problemas: ${problemas.length}\n`);

        if (problemas.length > 0) {
            const porTipo = {};
            problemas.forEach(p => { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });

            console.log('POR TIPO:\n');
            Object.entries(porTipo).forEach(([tipo, qtd]) => {
                console.log(`   ${tipo}: ${qtd}`);
            });

            console.log('\n' + '═'.repeat(80));
            console.log('📋 DETALHAMENTO');
            console.log('═'.repeat(80) + '\n');

            problemas.forEach((p, i) => {
                console.log(`[${i + 1}] ID ${p.id} ${p.codigo ? `- Código ${p.codigo}` : ''}`);
                console.log(`    ${p.cliente || ''}`);
                console.log(`    Tipo: ${p.tipo}`);
                if (p.paymentId) console.log(`    Payment: ${p.paymentId}`);
                if (p.atual) console.log(`    Atual: ${p.atual} | Esperado: ${p.esperado}`);
                if (p.linkCorreto) console.log(`    Link correto: ${p.linkCorreto}`);
                console.log('');
            });
        }

        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

auditoriaOutubro();
