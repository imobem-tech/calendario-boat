// ============================================================
// Gerar Planilha Excel de Baixas a Corrigir - V.260917162
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import XLSX from 'xlsx';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function gerarPlanilhaExcel() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('🔍 Buscando registros a serem corrigidos...\n');

        // Buscar TODOS os registros que serão corrigidos
        const queryCategoriaA = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Documento",
                cr."Código_Cliente",
                c."Cliente_Nome",
                c."Cliente_CPF",
                c."Cliente_Telefone_Celular",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cc."Descrição" as empresa,
                cc."Codigo" as centro_custo,
                'SEM CUSTOMER_ID' as categoria,
                'Cliente não possui cadastro no Asaas' as motivo
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Codigo" IS NOT NULL
            AND cr."Codigo" != 0
            AND cr."Data_Pagamento" IS NOT NULL
            AND cr."Observacões_Pagamento" LIKE '%Asaas%'
            AND cr."Observacões_Pagamento" NOT LIKE 'BAIXA INDEVIDA%'
            AND (
                (cc."Descrição" LIKE '%ALLMAX%' AND (c."Cliente_ID_tab_6" IS NULL OR c."Cliente_ID_tab_6" = ''))
                OR (cc."Descrição" LIKE '%IMOBEM%' AND (c."Cliente_ID_tab_8" IS NULL OR c."Cliente_ID_tab_8" = ''))
                OR (cc."Descrição" LIKE '%IMOBAN%' AND (c."Cliente_ID_tab_9" IS NULL OR c."Cliente_ID_tab_9" = ''))
                OR (cc."Descrição" LIKE '%SUMMER%' AND (c."Cliente_ID_tab_6" IS NULL OR c."Cliente_ID_tab_6" = ''))
                OR (c."Codigo" IS NULL)
            )
        `;

        const resultCategoriaA = await client.query(queryCategoriaA);
        console.log(`📊 Categoria A (sem Customer_ID): ${resultCategoriaA.rows.length} registros`);

        const idsVerificados = [
            37070, 48621, 48622, 48631, 48840, 48883, 48930, 48933,
            49062, 49146, 49361, 49472, 49488, 49552, 49620, 49675, 49689
        ];

        const queryCategoriaB = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Documento",
                cr."Código_Cliente",
                c."Cliente_Nome",
                c."Cliente_CPF",
                c."Cliente_Telefone_Celular",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cc."Descrição" as empresa,
                cc."Codigo" as centro_custo,
                'VERIFICADO ASAAS' as categoria,
                'Consultado na API do Asaas - Cobrança não encontrada para este cliente' as motivo
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."ID" = ANY($1::integer[])
            AND cr."Observacões_Pagamento" LIKE '%Asaas%'
            AND cr."Observacões_Pagamento" NOT LIKE 'BAIXA INDEVIDA%'
        `;

        const resultCategoriaB = await client.query(queryCategoriaB, [idsVerificados]);
        console.log(`📊 Categoria B (verificado no Asaas): ${resultCategoriaB.rows.length} registros\n`);

        // Combinar todos os registros
        const todosRegistros = [...resultCategoriaA.rows, ...resultCategoriaB.rows];

        console.log(`📊 Total de registros: ${todosRegistros.length}\n`);

        if (todosRegistros.length === 0) {
            console.log('❌ Nenhum registro encontrado para gerar planilha!');
            return;
        }

        // Preparar dados para o Excel
        const dadosExcel = todosRegistros.map(r => ({
            'ID': r.ID,
            'Código': r.Codigo,
            'Documento': r.Documento,
            'Código Cliente': r.Código_Cliente,
            'Nome Cliente': r.Cliente_Nome || 'SEM CADASTRO',
            'CPF/CNPJ': r.Cliente_CPF || '',
            'Telefone': r.Cliente_Telefone_Celular || '',
            'Empresa': r.empresa || 'NÃO IDENTIFICADA',
            'Centro Custo': r.centro_custo || '',
            'Data Vencimento': r.Data_Vencimento ?
                new Date(r.Data_Vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
            'Valor': parseFloat(r.Valor || 0),
            'Total Atual': parseFloat(r.Total || 0),
            'Data Pagamento (INCORRETA)': r.Data_Pagamento ?
                new Date(r.Data_Pagamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
            'Categoria Erro': r.categoria,
            'Motivo': r.motivo,
            'Observações Originais': r.Observacões_Pagamento || ''
        }));

        // Criar planilha
        console.log('📝 Gerando planilha Excel...\n');

        const wb = XLSX.utils.book_new();

        // Aba 1: Registros a corrigir
        const ws1 = XLSX.utils.json_to_sheet(dadosExcel);

        // Ajustar largura das colunas
        ws1['!cols'] = [
            { wch: 8 },   // ID
            { wch: 10 },  // Código
            { wch: 12 },  // Documento
            { wch: 12 },  // Código Cliente
            { wch: 35 },  // Nome Cliente
            { wch: 18 },  // CPF/CNPJ
            { wch: 16 },  // Telefone
            { wch: 20 },  // Empresa
            { wch: 12 },  // Centro Custo
            { wch: 15 },  // Data Vencimento
            { wch: 12 },  // Valor
            { wch: 12 },  // Total Atual
            { wch: 20 },  // Data Pagamento
            { wch: 18 },  // Categoria Erro
            { wch: 50 },  // Motivo
            { wch: 60 }   // Observações
        ];

        XLSX.utils.book_append_sheet(wb, ws1, 'Registros a Corrigir');

        // Aba 2: Resumo por categoria
        const resumoCategoria = [
            {
                'Categoria': 'SEM CUSTOMER_ID',
                'Quantidade': resultCategoriaA.rows.length,
                'Valor Total': resultCategoriaA.rows.reduce((sum, r) => sum + parseFloat(r.Valor || 0), 0).toFixed(2),
                'Descrição': 'Cliente não possui cadastro no Asaas - impossível ter recebido via webhook'
            },
            {
                'Categoria': 'VERIFICADO ASAAS',
                'Quantidade': resultCategoriaB.rows.length,
                'Valor Total': resultCategoriaB.rows.reduce((sum, r) => sum + parseFloat(r.Valor || 0), 0).toFixed(2),
                'Descrição': 'Consultado na API do Asaas - cobrança não encontrada para este cliente'
            },
            {
                'Categoria': 'TOTAL',
                'Quantidade': todosRegistros.length,
                'Valor Total': todosRegistros.reduce((sum, r) => sum + parseFloat(r.Valor || 0), 0).toFixed(2),
                'Descrição': 'Total geral de baixas incorretas identificadas'
            }
        ];

        const ws2 = XLSX.utils.json_to_sheet(resumoCategoria);
        ws2['!cols'] = [
            { wch: 20 },  // Categoria
            { wch: 12 },  // Quantidade
            { wch: 15 },  // Valor Total
            { wch: 70 }   // Descrição
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');

        // Aba 3: Resumo por empresa
        const porEmpresa = {};
        todosRegistros.forEach(r => {
            const empresa = r.empresa || 'NÃO IDENTIFICADA';
            if (!porEmpresa[empresa]) {
                porEmpresa[empresa] = {
                    quantidade: 0,
                    valor: 0
                };
            }
            porEmpresa[empresa].quantidade++;
            porEmpresa[empresa].valor += parseFloat(r.Valor || 0);
        });

        const resumoEmpresa = Object.entries(porEmpresa).map(([empresa, dados]) => ({
            'Empresa': empresa,
            'Quantidade': dados.quantidade,
            'Valor Total': dados.valor.toFixed(2)
        }));

        const ws3 = XLSX.utils.json_to_sheet(resumoEmpresa);
        ws3['!cols'] = [
            { wch: 30 },  // Empresa
            { wch: 12 },  // Quantidade
            { wch: 15 }   // Valor Total
        ];
        XLSX.utils.book_append_sheet(wb, ws3, 'Por Empresa');

        // Aba 4: Instruções
        const instrucoes = [
            { 'INSTRUÇÕES PARA CORREÇÃO': '' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'Este arquivo contém a relação completa das parcelas que serão corrigidas.' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'PROBLEMA IDENTIFICADO:' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'O webhook do Asaas baixou incorretamente estas contas porque:' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '1. Cliente não tem Customer_ID cadastrado no Asaas (Categoria A)' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '2. Cobrança não existe no Asaas para aquele cliente (Categoria B)' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'CORREÇÃO A SER REALIZADA:' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '1. Data_Pagamento será LIMPA (setada para NULL)' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '2. Total será setado para 0 (zero)' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '3. Observacões_Pagamento terá "BAIXA INDEVIDA" adicionado no início' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'PRÓXIMOS PASSOS:' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '1. Revisar esta planilha' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '2. Executar o script: node executar_correcao_baixas.js' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '3. Confirmar a execução quando solicitado' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '4. Entrar em contato com os clientes para cobrar os valores' },
            { 'INSTRUÇÕES PARA CORREÇÃO': '' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'BACKUP:' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'Um backup será criado automaticamente na tabela Contas_Receber_Backup_20260917' },
            { 'INSTRUÇÕES PARA CORREÇÃO': 'Caso necessário reverter, há script SQL de reversão disponível.' }
        ];

        const ws4 = XLSX.utils.json_to_sheet(instrucoes);
        ws4['!cols'] = [{ wch: 100 }];
        XLSX.utils.book_append_sheet(wb, ws4, 'INSTRUÇÕES');

        // Salvar arquivo
        const nomeArquivo = `PARCELAS_A_CORRIGIR_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 10)}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);

        console.log('✅ Planilha Excel gerada com sucesso!\n');
        console.log(`📁 Arquivo: ${nomeArquivo}\n`);
        console.log('📊 Conteúdo:');
        console.log('   Aba 1: Registros a Corrigir (detalhes completos)');
        console.log('   Aba 2: Resumo por Categoria');
        console.log('   Aba 3: Resumo por Empresa');
        console.log('   Aba 4: Instruções\n');
        console.log(`📈 Total de registros: ${todosRegistros.length}`);
        console.log(`💰 Valor total: R$ ${todosRegistros.reduce((sum, r) => sum + parseFloat(r.Valor || 0), 0).toFixed(2)}\n`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

gerarPlanilhaExcel();
