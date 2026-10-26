// ============================================================
// Análise Código por Código - V.260917180
// Analisa cada código duplicado detalhadamente
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import XLSX from 'xlsx';
import fs from 'fs';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function analisarCodigoPorCodigo() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('🔍 BUSCANDO TODOS OS CÓDIGOS DUPLICADOS...\n');

        // Buscar TODOS os registros com códigos duplicados que foram baixados pelo Asaas
        const query = `
            WITH codigos_duplicados AS (
                SELECT "Codigo"
                FROM "Contas_Receber"
                WHERE "Codigo" IS NOT NULL
                AND "Codigo" != 0
                AND "Data_Pagamento" IS NOT NULL
                AND "Observacões_Pagamento" LIKE '%Asaas%'
                GROUP BY "Codigo"
                HAVING COUNT(*) > 1
            )
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Documento",
                cr."Código_Cliente",
                c."Cliente_Nome",
                c."Cliente_CPF",
                c."Cliente_Telefone_Celular",
                c."Cliente_ID_tab_6" as customer_id_tab6_allmax,
                c."Cliente_ID_tab_8" as customer_id_tab8_imobem,
                c."Cliente_ID_tab_9" as customer_id_tab9_imoban,
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                c."Empresa" as empresa_cliente,
                c."id_empresa"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Codigo" IN (SELECT "Codigo" FROM codigos_duplicados)
            AND cr."Data_Pagamento" IS NOT NULL
            AND cr."Observacões_Pagamento" LIKE '%Asaas%'
            ORDER BY cr."Codigo", cr."ID"
        `;

        const result = await client.query(query);
        console.log(`📊 Total de registros baixados: ${result.rows.length}\n`);

        // Agrupar por código
        const porCodigo = {};
        result.rows.forEach(r => {
            if (!porCodigo[r.Codigo]) {
                porCodigo[r.Codigo] = [];
            }
            porCodigo[r.Codigo].push(r);
        });

        const codigos = Object.keys(porCodigo).sort((a, b) => parseInt(a) - parseInt(b));
        console.log(`📊 Códigos duplicados encontrados: ${codigos.length}\n`);

        // Array para armazenar a análise detalhada
        const analiseCompleta = [];

        // Para cada código, fazer análise detalhada
        for (const codigo of codigos) {
            const registros = porCodigo[codigo];

            console.log('='.repeat(80));
            console.log(`CÓDIGO: ${codigo} (${registros.length} registros duplicados)`);
            console.log('='.repeat(80) + '\n');

            // Mostrar cada registro
            registros.forEach((r, idx) => {
                console.log(`[${idx + 1}/${registros.length}] ID: ${r.ID}`);
                console.log(`      Documento: ${r.Documento}`);
                console.log(`      Cliente: [${r.Código_Cliente}] ${r.Cliente_Nome || 'SEM CADASTRO'}`);
                console.log(`      CPF: ${r.Cliente_CPF || 'N/A'}`);
                console.log(`      Telefone: ${r.Cliente_Telefone_Celular || 'N/A'}`);
                console.log(`      Empresa Conta: ${r.empresa || 'NÃO IDENTIFICADA'} (Centro_Custo: ${r.Centro_Custo})`);
                console.log(`      Empresa Cliente: ${r.empresa_cliente || 'N/A'} (id_empresa: ${r.id_empresa || 'N/A'})`);
                console.log(`      Vencimento: ${r.Data_Vencimento ? new Date(r.Data_Vencimento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : 'N/A'}`);
                console.log(`      Valor: R$ ${parseFloat(r.Valor || 0).toFixed(2)}`);
                console.log(`      Total: R$ ${parseFloat(r.Total || 0).toFixed(2)}`);
                console.log(`      Data Pagamento: ${r.Data_Pagamento ? new Date(r.Data_Pagamento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : 'N/A'}`);

                // Determinar qual Customer_ID usar
                const empresaConta = (r.empresa || '').toUpperCase();
                let customerID = '';
                let campoUsado = '';

                if (empresaConta.includes('ALLMAX') || empresaConta.includes('SUMMER')) {
                    customerID = r.customer_id_tab6_allmax || '';
                    campoUsado = 'tab_6 (ALLMAX/SUMMER)';
                } else if (empresaConta.includes('IMOBEM')) {
                    customerID = r.customer_id_tab8_imobem || '';
                    campoUsado = 'tab_8 (IMOBEM)';
                } else if (empresaConta.includes('IMOBAN')) {
                    customerID = r.customer_id_tab9_imoban || '';
                    campoUsado = 'tab_9 (IMOBAN)';
                }

                console.log(`      Customer_ID usado (${campoUsado}): ${customerID || '❌ VAZIO/NULL'}`);
                console.log(`      Outros Customer_IDs:`);
                console.log(`         tab_6: ${r.customer_id_tab6_allmax || 'vazio'}`);
                console.log(`         tab_8: ${r.customer_id_tab8_imobem || 'vazio'}`);
                console.log(`         tab_9: ${r.customer_id_tab9_imoban || 'vazio'}`);
                console.log(`      Observações: ${r.Observacões_Pagamento?.substring(0, 80) || 'N/A'}...\n`);

                // Adicionar à análise completa
                analiseCompleta.push({
                    Codigo: r.Codigo,
                    ID: r.ID,
                    Documento: r.Documento,
                    Codigo_Cliente: r.Código_Cliente,
                    Nome_Cliente: r.Cliente_Nome || 'SEM CADASTRO',
                    CPF: r.Cliente_CPF || '',
                    Telefone: r.Cliente_Telefone_Celular || '',
                    Empresa_Conta: r.empresa || 'NÃO IDENTIFICADA',
                    Centro_Custo: r.Centro_Custo,
                    Empresa_Cliente: r.empresa_cliente || '',
                    id_empresa: r.id_empresa || '',
                    Data_Vencimento: r.Data_Vencimento ? new Date(r.Data_Vencimento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : '',
                    Valor: parseFloat(r.Valor || 0),
                    Total: parseFloat(r.Total || 0),
                    Data_Pagamento: r.Data_Pagamento ? new Date(r.Data_Pagamento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : '',
                    Customer_ID_Usado: customerID,
                    Campo_Customer_ID: campoUsado,
                    Customer_ID_tab6: r.customer_id_tab6_allmax || '',
                    Customer_ID_tab8: r.customer_id_tab8_imobem || '',
                    Customer_ID_tab9: r.customer_id_tab9_imoban || '',
                    Observacoes: r.Observacões_Pagamento || ''
                });
            });

            // Análise do bloco
            console.log('─'.repeat(80));
            console.log('ANÁLISE DO BLOCO:\n');

            const comCustomerID = registros.filter(r => {
                const empresaConta = (r.empresa || '').toUpperCase();
                if (empresaConta.includes('ALLMAX') || empresaConta.includes('SUMMER')) {
                    return r.customer_id_tab6_allmax && r.customer_id_tab6_allmax !== '';
                } else if (empresaConta.includes('IMOBEM')) {
                    return r.customer_id_tab8_imobem && r.customer_id_tab8_imobem !== '';
                } else if (empresaConta.includes('IMOBAN')) {
                    return r.customer_id_tab9_imoban && r.customer_id_tab9_imoban !== '';
                }
                return false;
            });

            const semCustomerID = registros.length - comCustomerID.length;

            console.log(`Registros COM Customer_ID (para sua empresa): ${comCustomerID.length}`);
            console.log(`Registros SEM Customer_ID (para sua empresa): ${semCustomerID}`);

            if (comCustomerID.length === 1) {
                const correto = comCustomerID[0];
                console.log(`\n✅ PROVÁVEL CORRETO: ID ${correto.ID} - ${correto.Cliente_Nome}`);
                console.log(`❌ PROVÁVEIS INCORRETOS: ${semCustomerID} registro(s)\n`);
            } else if (comCustomerID.length > 1) {
                console.log(`\n⚠️  ATENÇÃO: ${comCustomerID.length} registros têm Customer_ID`);
                console.log(`   PRECISA REVISAR MANUALMENTE - pode ter mais de 1 correto\n`);
            } else {
                console.log(`\n❌ TODOS SEM Customer_ID - TODOS podem estar incorretos\n`);
            }

            console.log('\n');
        }

        // Gerar planilha Excel detalhada
        console.log('📝 Gerando planilha Excel com análise completa...\n');

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(analiseCompleta);

        ws['!cols'] = [
            { wch: 10 },  // Codigo
            { wch: 8 },   // ID
            { wch: 12 },  // Documento
            { wch: 12 },  // Codigo_Cliente
            { wch: 35 },  // Nome_Cliente
            { wch: 18 },  // CPF
            { wch: 16 },  // Telefone
            { wch: 25 },  // Empresa_Conta
            { wch: 12 },  // Centro_Custo
            { wch: 12 },  // Empresa_Cliente
            { wch: 12 },  // id_empresa
            { wch: 15 },  // Data_Vencimento
            { wch: 12 },  // Valor
            { wch: 12 },  // Total
            { wch: 15 },  // Data_Pagamento
            { wch: 25 },  // Customer_ID_Usado
            { wch: 25 },  // Campo_Customer_ID
            { wch: 25 },  // Customer_ID_tab6
            { wch: 25 },  // Customer_ID_tab8
            { wch: 25 },  // Customer_ID_tab9
            { wch: 80 }   // Observacoes
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Análise Detalhada');

        const nomeArquivo = `ANALISE_CODIGO_POR_CODIGO_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 10)}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);

        console.log('✅ Planilha gerada com sucesso!');
        console.log(`📁 Arquivo: ${nomeArquivo}\n`);
        console.log(`📊 Total de códigos duplicados: ${codigos.length}`);
        console.log(`📊 Total de registros: ${analiseCompleta.length}\n`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

analisarCodigoPorCodigo();
