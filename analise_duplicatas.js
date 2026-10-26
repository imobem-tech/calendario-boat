// ============================================================
// Análise de Duplicatas em Contas_Receber - V.260917110
// Script para identificar e analisar códigos duplicados
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function analisarDuplicatas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        // PASSO 1: Identificar códigos duplicados
        console.log('🔍 PASSO 1: Identificando códigos duplicados...\n');

        const queryDuplicados = `
            SELECT
                "Codigo",
                COUNT(*) as quantidade_registros
            FROM "Contas_Receber"
            WHERE "Codigo" IS NOT NULL
            GROUP BY "Codigo"
            HAVING COUNT(*) > 1
            ORDER BY quantidade_registros DESC, "Codigo"
        `;

        const resultDuplicados = await client.query(queryDuplicados);
        console.log(`📊 Total de códigos duplicados: ${resultDuplicados.rows.length}\n`);

        if (resultDuplicados.rows.length === 0) {
            console.log('✅ Nenhum código duplicado encontrado!');
            return;
        }

        // Mostrar resumo
        console.log('Top 10 códigos mais duplicados:');
        resultDuplicados.rows.slice(0, 10).forEach((row, idx) => {
            console.log(`${idx + 1}. Código ${row.Codigo}: ${row.quantidade_registros} registros`);
        });
        console.log('\n');

        // PASSO 2: Buscar detalhes completos de TODAS as contas duplicadas
        console.log('🔍 PASSO 2: Buscando detalhes de todas as contas duplicadas...\n');

        const codigosDuplicados = resultDuplicados.rows.map(r => r.Codigo);

        const queryDetalhes = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Documento",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cr."Centro_Custo",
                cr."Código_Cliente"
            FROM "Contas_Receber" cr
            WHERE cr."Codigo" = ANY($1::integer[])
            ORDER BY cr."Codigo", cr."Data_Vencimento"
        `;

        const resultDetalhes = await client.query(queryDetalhes, [codigosDuplicados]);
        console.log(`📋 Total de registros duplicados: ${resultDetalhes.rows.length}\n`);

        // PASSO 3: Buscar informações de Centro_Custo (empresas e tokens)
        console.log('🔍 PASSO 3: Buscando informações de empresas e tokens Asaas...\n');

        const queryCentroCusto = `
            SELECT
                "Codigo" as centro_custo_codigo,
                "Descrição" as empresa_nome,
                "API_Key" as token_asaas
            FROM "Centros_Custos"
            WHERE "Codigo" IS NOT NULL
        `;

        const resultCentroCusto = await client.query(queryCentroCusto);
        const mapCentroCusto = {};
        resultCentroCusto.rows.forEach(row => {
            mapCentroCusto[row.centro_custo_codigo] = {
                empresa: row.empresa_nome,
                token: row.token_asaas
            };
        });
        console.log(`📊 Total de empresas/centros de custo: ${resultCentroCusto.rows.length}\n`);

        // PASSO 4: Buscar informações de Clientes (Customer IDs Asaas)
        console.log('🔍 PASSO 4: Buscando Customer IDs do Asaas...\n');

        const codigosClientes = [...new Set(resultDetalhes.rows
            .map(r => r.Código_Cliente)
            .filter(c => c != null))];

        const queryClientes = `
            SELECT
                "Codigo" as codigo_cliente,
                "Cliente_Nome",
                "Cliente_ID_tab_6" as customer_id_allmax,
                "Cliente_ID_tab_8" as customer_id_imobem,
                "Cliente_ID_tab_9" as customer_id_imoban
            FROM "Cliente"
            WHERE "Codigo" = ANY($1::integer[])
        `;

        const resultClientes = await client.query(queryClientes, [codigosClientes]);
        const mapClientes = {};
        resultClientes.rows.forEach(row => {
            mapClientes[row.codigo_cliente] = {
                nome: row.Cliente_Nome,
                customer_id_allmax: row.customer_id_allmax,
                customer_id_imobem: row.customer_id_imobem,
                customer_id_imoban: row.customer_id_imoban
            };
        });
        console.log(`📊 Total de clientes envolvidos: ${resultClientes.rows.length}\n`);

        // PASSO 5: Consolidar dados
        console.log('🔍 PASSO 5: Consolidando dados...\n');

        const dadosConsolidados = resultDetalhes.rows.map(conta => {
            const centroCusto = mapCentroCusto[conta.Centro_Custo] || {};
            const cliente = mapClientes[conta.Código_Cliente] || {};

            // Determinar qual Customer ID usar com base na empresa
            let customerIdAsaas = null;
            let empresaIdentificada = centroCusto.empresa || '';

            if (empresaIdentificada.toUpperCase().includes('ALLMAX')) {
                customerIdAsaas = cliente.customer_id_allmax;
            } else if (empresaIdentificada.toUpperCase().includes('IMOBEM')) {
                customerIdAsaas = cliente.customer_id_imobem;
            } else if (empresaIdentificada.toUpperCase().includes('IMOBAN')) {
                customerIdAsaas = cliente.customer_id_imoban;
            }

            return {
                ID: conta.ID,
                Codigo: conta.Codigo,
                Documento: conta.Documento,
                Data_Vencimento: conta.Data_Vencimento ?
                    new Date(conta.Data_Vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
                Valor: conta.Valor,
                Total: conta.Total,
                Data_Pagamento: conta.Data_Pagamento ?
                    new Date(conta.Data_Pagamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
                Observacoes_Pagamento: conta.Observacões_Pagamento || '',
                Centro_Custo: conta.Centro_Custo,
                Empresa: centroCusto.empresa || 'NÃO IDENTIFICADA',
                Token_Asaas: centroCusto.token || 'SEM TOKEN',
                Codigo_Cliente: conta.Código_Cliente,
                Nome_Cliente: cliente.nome || 'NÃO IDENTIFICADO',
                Customer_ID_Asaas: customerIdAsaas || 'SEM CUSTOMER ID'
            };
        });

        // PASSO 6: Gerar relatórios
        console.log('📝 PASSO 6: Gerando relatórios...\n');

        // Relatório 1: Resumo por código duplicado
        const relatorioResumoCodigos = [];
        const codigosAgrupados = {};

        dadosConsolidados.forEach(item => {
            if (!codigosAgrupados[item.Codigo]) {
                codigosAgrupados[item.Codigo] = [];
            }
            codigosAgrupados[item.Codigo].push(item);
        });

        for (const [codigo, registros] of Object.entries(codigosAgrupados)) {
            relatorioResumoCodigos.push({
                Codigo: codigo,
                Quantidade_Registros: registros.length,
                IDs: registros.map(r => r.ID).join(', '),
                Empresas: [...new Set(registros.map(r => r.Empresa))].join(', '),
                Clientes: [...new Set(registros.map(r => r.Nome_Cliente))].join(', '),
                Total_Baixado: registros.filter(r => r.Data_Pagamento).length,
                Total_Pendente: registros.filter(r => !r.Data_Pagamento).length
            });
        }

        // Salvar relatórios em JSON
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 15);

        fs.writeFileSync(
            `relatorio_duplicatas_consolidado_${timestamp}.json`,
            JSON.stringify(dadosConsolidados, null, 2)
        );

        fs.writeFileSync(
            `relatorio_duplicatas_resumo_${timestamp}.json`,
            JSON.stringify(relatorioResumoCodigos, null, 2)
        );

        // Gerar CSV para Excel
        const csvHeader = Object.keys(dadosConsolidados[0]).join('\t') + '\n';
        const csvContent = dadosConsolidados.map(item =>
            Object.values(item).join('\t')
        ).join('\n');

        fs.writeFileSync(
            `relatorio_duplicatas_${timestamp}.csv`,
            csvHeader + csvContent
        );

        console.log('✅ Relatórios gerados:');
        console.log(`   - relatorio_duplicatas_consolidado_${timestamp}.json (detalhes completos)`);
        console.log(`   - relatorio_duplicatas_resumo_${timestamp}.json (resumo por código)`);
        console.log(`   - relatorio_duplicatas_${timestamp}.csv (para Excel)\n`);

        // Mostrar estatísticas
        console.log('📊 ESTATÍSTICAS:\n');
        console.log(`Total de códigos duplicados: ${Object.keys(codigosAgrupados).length}`);
        console.log(`Total de registros duplicados: ${dadosConsolidados.length}`);
        console.log(`Total com Data_Pagamento preenchida: ${dadosConsolidados.filter(r => r.Data_Pagamento).length}`);
        console.log(`Total pendente (sem Data_Pagamento): ${dadosConsolidados.filter(r => !r.Data_Pagamento).length}\n`);

        // Mostrar exemplo do código 56626 mencionado
        console.log('🔍 EXEMPLO: Código 56626 (mencionado na descrição do problema):\n');
        const exemplo56626 = dadosConsolidados.filter(r => r.Codigo === 56626);
        if (exemplo56626.length > 0) {
            exemplo56626.forEach(item => {
                console.log(`ID: ${item.ID} | Venc: ${item.Data_Vencimento} | Valor: ${item.Valor} | Pago: ${item.Data_Pagamento} | Cliente: ${item.Nome_Cliente}`);
            });
        } else {
            console.log('Código 56626 não encontrado nas duplicatas atuais.');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Desconectado do banco');
    }
}

// Executar análise
analisarDuplicatas();
