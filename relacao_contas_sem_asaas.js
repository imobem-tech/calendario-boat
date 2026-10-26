// ============================================================
// relacao_contas_sem_asaas.js — V.2610061550
// Relação detalhada de TODAS as contas sem cadastro no Asaas
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function listarContasSemAsaas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('CONTAS SEM CADASTRO NO ASAAS (desde 01/10/2026)');
        console.log('═'.repeat(80) + '\n');

        const query = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Descrição" as descricao,
                cr."Valor",
                cr."Data_Vencimento",
                cr."Data_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                c."Codigo" as codigo_cliente,
                c."Cliente_Nome" as nome_cliente,
                c."Cliente_CPF" as cpf,
                c."Cliente_Telefone_Celular" as telefone
            FROM "Contas_Receber" cr
            INNER JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            INNER JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Data_Conta" >= '2026-10-01'::date
            AND (
                (cr."Centro_Custo"::integer IN (6, 8) AND c."Cliente_ID_tab_6" IS NULL)
                OR (cr."Centro_Custo"::integer = 4 AND c."Cliente_ID_tab_8" IS NULL)
            )
            ORDER BY c."Cliente_Nome", cr."Data_Vencimento"
        `;

        const result = await client.query(query);

        console.log(`📊 Total: ${result.rows.length} CONTAS de clientes sem cadastro no Asaas\n`);

        // Agrupar por cliente
        const porCliente = {};
        result.rows.forEach(conta => {
            const key = conta.nome_cliente;
            if (!porCliente[key]) {
                porCliente[key] = {
                    nome: conta.nome_cliente,
                    codigo: conta.codigo_cliente,
                    cpf: conta.cpf,
                    telefone: conta.telefone,
                    empresa: conta.empresa,
                    contas: []
                };
            }
            porCliente[key].contas.push(conta);
        });

        const clientes = Object.values(porCliente);
        console.log(`📊 Distribuição: ${clientes.length} CLIENTES com ${result.rows.length} contas\n`);

        console.log('═'.repeat(80) + '\n');

        // Listar por cliente
        let totalGeral = 0;
        clientes.forEach((cliente, idx) => {
            const totalCliente = cliente.contas.reduce((sum, c) => sum + parseFloat(c.Valor || 0), 0);
            totalGeral += totalCliente;

            console.log(`[${idx + 1}] ${cliente.nome} (${cliente.contas.length} conta${cliente.contas.length > 1 ? 's' : ''})`);
            console.log(`    Código Cliente: ${cliente.codigo}`);
            console.log(`    CPF: ${cliente.cpf || 'N/A'}`);
            console.log(`    Telefone: ${cliente.telefone || 'N/A'}`);
            console.log(`    Empresa: ${cliente.empresa}\n`);

            cliente.contas.forEach((conta, i) => {
                const status = conta.Data_Pagamento ? '✅ PAGO' : '⏳ ABERTO';
                const vencimento = conta.Data_Vencimento
                    ? new Date(conta.Data_Vencimento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})
                    : 'N/A';

                console.log(`    [${i + 1}] ID: ${conta.ID} | Código: ${conta.Codigo}`);
                console.log(`        Descrição: ${conta.descricao || 'N/A'}`);
                console.log(`        Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);
                console.log(`        Vencimento: ${vencimento}`);
                console.log(`        Status: ${status}\n`);
            });

            console.log(`    💰 Subtotal: R$ ${totalCliente.toFixed(2)}\n`);
            console.log('─'.repeat(80) + '\n');
        });

        console.log('═'.repeat(80));
        console.log('📊 RESUMO GERAL');
        console.log('═'.repeat(80) + '\n');

        console.log(`Total de CLIENTES: ${clientes.length}`);
        console.log(`Total de CONTAS: ${result.rows.length}`);
        console.log(`Valor TOTAL: R$ ${totalGeral.toFixed(2)}\n`);

        // Distribuição por empresa
        const porEmpresa = {};
        result.rows.forEach(conta => {
            const empresa = conta.empresa || `Centro ${conta.Centro_Custo}`;
            if (!porEmpresa[empresa]) {
                porEmpresa[empresa] = { contas: 0, valor: 0 };
            }
            porEmpresa[empresa].contas++;
            porEmpresa[empresa].valor += parseFloat(conta.Valor || 0);
        });

        console.log('Por empresa:');
        Object.entries(porEmpresa).forEach(([empresa, dados]) => {
            console.log(`   ${empresa}: ${dados.contas} conta${dados.contas > 1 ? 's' : ''} | R$ ${dados.valor.toFixed(2)}`);
        });

        console.log('\n═'.repeat(80) + '\n');

        // Gerar tabela resumida
        console.log('📋 TABELA RESUMIDA:\n');
        console.log('Cliente                               | ID CR  | Código | Valor      | Vencimento | Status');
        console.log('─'.repeat(100));

        result.rows.forEach(conta => {
            const nome = (conta.nome_cliente || 'SEM NOME').substring(0, 35).padEnd(35);
            const id = String(conta.ID).padEnd(6);
            const codigo = String(conta.Codigo).padEnd(6);
            const valor = `R$ ${parseFloat(conta.Valor).toFixed(2)}`.padEnd(10);
            const vencimento = conta.Data_Vencimento
                ? new Date(conta.Data_Vencimento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}).padEnd(10)
                : 'N/A'.padEnd(10);
            const status = conta.Data_Pagamento ? '✅ PAGO' : '⏳ ABERTO';

            console.log(`${nome} | ${id} | ${codigo} | ${valor} | ${vencimento} | ${status}`);
        });

        console.log('\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

listarContasSemAsaas();
