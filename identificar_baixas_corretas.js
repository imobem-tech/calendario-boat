// ============================================================
// Identificar Baixas Corretas vs Incorretas - V.260917163
// Para cada código duplicado, identifica qual parcela está
// corretamente baixada e quais foram baixadas por erro
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import XLSX from 'xlsx';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function identificarBaixasCorretas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('🔍 Buscando todos os códigos duplicados...\n');

        // Buscar TODOS os registros com códigos duplicados que foram baixados
        const queryTodos = `
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
                c."Cliente_ID_tab_6" as customer_id_allmax,
                c."Cliente_ID_tab_8" as customer_id_imobem,
                c."Cliente_ID_tab_9" as customer_id_imoban,
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cc."Descrição" as empresa,
                cc."Codigo" as centro_custo
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Codigo" IN (SELECT "Codigo" FROM codigos_duplicados)
            AND cr."Data_Pagamento" IS NOT NULL
            AND cr."Observacões_Pagamento" LIKE '%Asaas%'
            ORDER BY cr."Codigo", cr."ID"
        `;

        const result = await client.query(queryTodos);
        console.log(`📊 Total de registros duplicados baixados: ${result.rows.length}\n`);

        // Agrupar por código
        const porCodigo = {};
        result.rows.forEach(r => {
            if (!porCodigo[r.Codigo]) {
                porCodigo[r.Codigo] = [];
            }
            porCodigo[r.Codigo].push(r);
        });

        console.log(`📊 Códigos duplicados: ${Object.keys(porCodigo).length}\n`);

        // Arrays para separar baixas corretas e incorretas
        const baixasCorretas = [];
        const baixasIncorretas = [];

        // Para cada código duplicado, identificar qual é a baixa correta
        for (const [codigo, registros] of Object.entries(porCodigo)) {
            console.log(`\n🔍 Analisando código ${codigo} (${registros.length} registros):`);

            // Determinar qual Customer_ID usar com base na empresa
            const registrosComCustomer = registros.filter(r => {
                const empresa = (r.empresa || '').toUpperCase();

                if (empresa.includes('ALLMAX') && r.customer_id_allmax) return true;
                if (empresa.includes('IMOBEM') && r.customer_id_imobem) return true;
                if (empresa.includes('IMOBAN') && r.customer_id_imoban) return true;
                if (empresa.includes('SUMMER') && r.customer_id_allmax) return true;

                return false;
            });

            console.log(`   Registros COM Customer_ID: ${registrosComCustomer.length}`);
            console.log(`   Registros SEM Customer_ID: ${registros.length - registrosComCustomer.length}`);

            if (registrosComCustomer.length === 1) {
                // Caso ideal: apenas 1 registro tem Customer_ID válido
                // Este é provavelmente o correto
                const correto = registrosComCustomer[0];
                const empresa = (correto.empresa || '').toUpperCase();
                let customerID = '';

                if (empresa.includes('ALLMAX') || empresa.includes('SUMMER')) {
                    customerID = correto.customer_id_allmax;
                } else if (empresa.includes('IMOBEM')) {
                    customerID = correto.customer_id_imobem;
                } else if (empresa.includes('IMOBAN')) {
                    customerID = correto.customer_id_imoban;
                }

                baixasCorretas.push({
                    ...correto,
                    customer_id_usado: customerID,
                    motivo_classificacao: 'Único registro com Customer_ID válido',
                    confianca: 'ALTA'
                });

                // Os demais são incorretos
                registros
                    .filter(r => r.ID !== correto.ID)
                    .forEach(r => {
                        baixasIncorretas.push({
                            ...r,
                            customer_id_usado: '',
                            motivo_classificacao: 'Cliente sem Customer_ID - impossível ter pago via Asaas',
                            confianca: 'ALTA',
                            id_correto: correto.ID,
                            cliente_correto: correto.Cliente_Nome
                        });
                    });

                console.log(`   ✅ CORRETO: ID ${correto.ID} - ${correto.Cliente_Nome} (${customerID})`);
                console.log(`   ❌ INCORRETOS: ${registros.length - 1} registro(s)`);

            } else if (registrosComCustomer.length > 1) {
                // Caso complexo: múltiplos registros com Customer_ID
                // Neste caso, marcar todos como "REVISAR" pois não sabemos qual é o correto
                console.log(`   ⚠️  CASO COMPLEXO: ${registrosComCustomer.length} registros com Customer_ID`);
                console.log(`   AÇÃO: Marcar todos como REVISAR MANUALMENTE`);

                registros.forEach(r => {
                    const empresa = (r.empresa || '').toUpperCase();
                    let customerID = '';

                    if (empresa.includes('ALLMAX') || empresa.includes('SUMMER')) {
                        customerID = r.customer_id_allmax || '';
                    } else if (empresa.includes('IMOBEM')) {
                        customerID = r.customer_id_imobem || '';
                    } else if (empresa.includes('IMOBAN')) {
                        customerID = r.customer_id_imoban || '';
                    }

                    baixasIncorretas.push({
                        ...r,
                        customer_id_usado: customerID,
                        motivo_classificacao: 'Múltiplos registros com Customer_ID - REVISAR MANUALMENTE',
                        confianca: 'BAIXA',
                        id_correto: null,
                        cliente_correto: null
                    });
                });

            } else {
                // Caso: nenhum registro tem Customer_ID
                // Todos são incorretos
                console.log(`   ❌ TODOS INCORRETOS: Nenhum tem Customer_ID`);

                registros.forEach(r => {
                    baixasIncorretas.push({
                        ...r,
                        customer_id_usado: '',
                        motivo_classificacao: 'Nenhum registro tem Customer_ID - todos incorretos',
                        confianca: 'ALTA',
                        id_correto: null,
                        cliente_correto: 'NENHUM (todos incorretos)'
                    });
                });
            }
        }

        console.log('\n\n📊 RESULTADO DA ANÁLISE:\n');
        console.log(`   Baixas CORRETAS: ${baixasCorretas.length}`);
        console.log(`   Baixas INCORRETAS: ${baixasIncorretas.length}`);
        console.log(`   Total: ${baixasCorretas.length + baixasIncorretas.length}\n`);

        const valorCorreto = baixasCorretas.reduce((sum, b) => sum + parseFloat(b.Valor || 0), 0);
        const valorIncorreto = baixasIncorretas.reduce((sum, b) => sum + parseFloat(b.Valor || 0), 0);

        console.log(`   Valor das baixas CORRETAS: R$ ${valorCorreto.toFixed(2)}`);
        console.log(`   Valor das baixas INCORRETAS: R$ ${valorIncorreto.toFixed(2)}\n`);

        // Gerar planilha Excel
        console.log('📝 Gerando planilha Excel...\n');

        const wb = XLSX.utils.book_new();

        // Aba 1: Baixas CORRETAS
        const dadosCorretos = baixasCorretas.map(r => ({
            'ID': r.ID,
            'Código': r.Codigo,
            'Documento': r.Documento,
            'Código Cliente': r.Código_Cliente,
            'Nome Cliente': r.Cliente_Nome || 'SEM CADASTRO',
            'CPF/CNPJ': r.Cliente_CPF || '',
            'Telefone': r.Cliente_Telefone_Celular || '',
            'Customer ID Asaas': r.customer_id_usado,
            'Empresa': r.empresa || 'NÃO IDENTIFICADA',
            'Data Vencimento': r.Data_Vencimento ?
                new Date(r.Data_Vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
            'Valor': parseFloat(r.Valor || 0),
            'Total': parseFloat(r.Total || 0),
            'Data Pagamento': r.Data_Pagamento ?
                new Date(r.Data_Pagamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
            'Motivo Classificação': r.motivo_classificacao,
            'Confiança': r.confianca,
            'Observações': r.Observacões_Pagamento || ''
        }));

        const ws1 = XLSX.utils.json_to_sheet(dadosCorretos);
        ws1['!cols'] = [
            { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 35 },
            { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
            { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 50 }, { wch: 12 }, { wch: 60 }
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Baixas CORRETAS');

        // Aba 2: Baixas INCORRETAS
        const dadosIncorretos = baixasIncorretas.map(r => ({
            'ID': r.ID,
            'Código': r.Codigo,
            'Documento': r.Documento,
            'Código Cliente': r.Código_Cliente,
            'Nome Cliente': r.Cliente_Nome || 'SEM CADASTRO',
            'CPF/CNPJ': r.Cliente_CPF || '',
            'Telefone': r.Cliente_Telefone_Celular || '',
            'Customer ID Asaas': r.customer_id_usado,
            'Empresa': r.empresa || 'NÃO IDENTIFICADA',
            'Data Vencimento': r.Data_Vencimento ?
                new Date(r.Data_Vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
            'Valor': parseFloat(r.Valor || 0),
            'Total': parseFloat(r.Total || 0),
            'Data Pagamento INCORRETA': r.Data_Pagamento ?
                new Date(r.Data_Pagamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
            'Motivo Classificação': r.motivo_classificacao,
            'Confiança': r.confianca,
            'ID Correto': r.id_correto || '',
            'Cliente Correto': r.cliente_correto || '',
            'Observações': r.Observacões_Pagamento || ''
        }));

        const ws2 = XLSX.utils.json_to_sheet(dadosIncorretos);
        ws2['!cols'] = [
            { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 35 },
            { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
            { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 50 }, { wch: 12 },
            { wch: 10 }, { wch: 35 }, { wch: 60 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Baixas INCORRETAS');

        // Aba 3: Resumo
        const resumo = [
            {
                'Categoria': 'Baixas CORRETAS',
                'Quantidade': baixasCorretas.length,
                'Valor Total': `R$ ${valorCorreto.toFixed(2)}`,
                'Descrição': 'Parcelas que foram realmente pagas e estão corretamente baixadas'
            },
            {
                'Categoria': 'Baixas INCORRETAS - Alta Confiança',
                'Quantidade': baixasIncorretas.filter(b => b.confianca === 'ALTA').length,
                'Valor Total': `R$ ${baixasIncorretas.filter(b => b.confianca === 'ALTA').reduce((sum, b) => sum + parseFloat(b.Valor || 0), 0).toFixed(2)}`,
                'Descrição': 'Cliente sem Customer_ID - certeza que está incorreto'
            },
            {
                'Categoria': 'Baixas INCORRETAS - Baixa Confiança',
                'Quantidade': baixasIncorretas.filter(b => b.confianca === 'BAIXA').length,
                'Valor Total': `R$ ${baixasIncorretas.filter(b => b.confianca === 'BAIXA').reduce((sum, b) => sum + parseFloat(b.Valor || 0), 0).toFixed(2)}`,
                'Descrição': 'Múltiplos registros com Customer_ID - REVISAR MANUALMENTE'
            }
        ];

        const ws3 = XLSX.utils.json_to_sheet(resumo);
        ws3['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'Resumo');

        // Salvar arquivo
        const nomeArquivo = `ANALISE_BAIXAS_CORRETAS_vs_INCORRETAS_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 10)}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);

        console.log('✅ Planilha Excel gerada com sucesso!\n');
        console.log(`📁 Arquivo: ${nomeArquivo}\n`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

identificarBaixasCorretas();
