// ============================================================
// Executar Correção de Baixas Indevidas - V.260917161
// Script para corrigir baixas feitas incorretamente pelo Asaas
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import readline from 'readline';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

// Função para perguntar confirmação ao usuário
function pergunta(texto) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(texto, (resposta) => {
            rl.close();
            resolve(resposta.trim().toLowerCase());
        });
    });
}

async function corrigirBaixasIndevidas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('🔍 PASSO 1: IDENTIFICANDO REGISTROS A SEREM CORRIGIDOS...\n');

        // Buscar registros da Categoria A (sem Customer_ID)
        const queryCategoriaA = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Documento",
                cr."Código_Cliente",
                c."Cliente_Nome",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cc."Descrição" as empresa
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo" = cc."Codigo"
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
            ORDER BY cr."ID"
        `;

        const resultCategoriaA = await client.query(queryCategoriaA);
        console.log(`📊 Categoria A (sem Customer_ID): ${resultCategoriaA.rows.length} registros`);

        const valorTotalA = resultCategoriaA.rows.reduce((sum, r) => sum + parseFloat(r.Valor || 0), 0);
        console.log(`   Valor total: R$ ${valorTotalA.toFixed(2)}\n`);

        // Buscar registros da Categoria B (verificados no Asaas)
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
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cc."Descrição" as empresa
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo" = cc."Codigo"
            WHERE cr."ID" = ANY($1::integer[])
            AND cr."Observacões_Pagamento" LIKE '%Asaas%'
            AND cr."Observacões_Pagamento" NOT LIKE 'BAIXA INDEVIDA%'
            ORDER BY cr."ID"
        `;

        const resultCategoriaB = await client.query(queryCategoriaB, [idsVerificados]);
        console.log(`📊 Categoria B (verificado no Asaas): ${resultCategoriaB.rows.length} registros`);

        const valorTotalB = resultCategoriaB.rows.reduce((sum, r) => sum + parseFloat(r.Valor || 0), 0);
        console.log(`   Valor total: R$ ${valorTotalB.toFixed(2)}\n`);

        const todosRegistros = [...resultCategoriaA.rows, ...resultCategoriaB.rows];
        const valorTotal = valorTotalA + valorTotalB;

        console.log(`📊 TOTAL A CORRIGIR: ${todosRegistros.length} registros (R$ ${valorTotal.toFixed(2)})\n`);

        if (todosRegistros.length === 0) {
            console.log('✅ Nenhum registro para corrigir!');
            return;
        }

        // Mostrar alguns exemplos
        console.log('📋 EXEMPLOS DE REGISTROS QUE SERÃO CORRIGIDOS:\n');
        todosRegistros.slice(0, 10).forEach(r => {
            console.log(`ID: ${r.ID} | Código: ${r.Codigo} | Cliente: ${r.Cliente_Nome || 'SEM CLIENTE'}`);
            console.log(`   Empresa: ${r.empresa || 'N/A'} | Valor: R$ ${r.Valor}`);
            console.log(`   Venc: ${r.Data_Vencimento?.toLocaleDateString('pt-BR') || 'N/A'} | Pago: ${r.Data_Pagamento?.toLocaleDateString('pt-BR') || 'N/A'}`);
            console.log(`   Obs: ${r.Observacões_Pagamento}\n`);
        });

        if (todosRegistros.length > 10) {
            console.log(`... e mais ${todosRegistros.length - 10} registros.\n`);
        }

        // Salvar lista completa antes da correção
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 15);
        fs.writeFileSync(
            `registros_a_corrigir_${timestamp}.json`,
            JSON.stringify(todosRegistros, null, 2)
        );
        console.log(`📁 Lista completa salva em: registros_a_corrigir_${timestamp}.json\n`);

        // Confirmação do usuário
        console.log('⚠️  ATENÇÃO: Esta operação irá:');
        console.log('   1. Criar backup dos registros na tabela Contas_Receber_Backup_20260917');
        console.log('   2. Limpar Data_Pagamento (setar NULL)');
        console.log('   3. Adicionar "BAIXA INDEVIDA" no início de Observacoes_Pagamento');
        console.log('   4. Setar Total = 0\n');

        const resposta = await pergunta('Deseja continuar com a correção? (s/n): ');

        if (resposta !== 's' && resposta !== 'sim') {
            console.log('\n❌ Operação cancelada pelo usuário.');
            return;
        }

        console.log('\n🔄 PASSO 2: CRIANDO BACKUP...\n');

        // Criar tabela de backup
        await client.query('CREATE TABLE IF NOT EXISTS "Contas_Receber_Backup_20260917" (LIKE "Contas_Receber" INCLUDING ALL)');

        // Inserir registros no backup
        const idsParaBackup = todosRegistros.map(r => r.ID);
        await client.query(`
            INSERT INTO "Contas_Receber_Backup_20260917"
            SELECT * FROM "Contas_Receber"
            WHERE "ID" = ANY($1::integer[])
            ON CONFLICT DO NOTHING
        `, [idsParaBackup]);

        const resultBackup = await client.query('SELECT COUNT(*) as total FROM "Contas_Receber_Backup_20260917"');
        console.log(`✅ Backup criado: ${resultBackup.rows[0].total} registros\n`);

        console.log('🔄 PASSO 3: CORRIGINDO CATEGORIA A (sem Customer_ID)...\n');

        // Corrigir Categoria A
        if (resultCategoriaA.rows.length > 0) {
            const idsA = resultCategoriaA.rows.map(r => r.ID);
            const updateA = await client.query(`
                UPDATE "Contas_Receber"
                SET
                    "Data_Pagamento" = NULL,
                    "Observacões_Pagamento" = 'BAIXA INDEVIDA - ' || COALESCE("Observacões_Pagamento", ''),
                    "Total" = 0
                WHERE "ID" = ANY($1::integer[])
            `, [idsA]);

            console.log(`✅ Categoria A corrigida: ${updateA.rowCount} registros\n`);
        }

        console.log('🔄 PASSO 4: CORRIGINDO CATEGORIA B (verificado Asaas)...\n');

        // Corrigir Categoria B
        if (resultCategoriaB.rows.length > 0) {
            const idsB = resultCategoriaB.rows.map(r => r.ID);
            const updateB = await client.query(`
                UPDATE "Contas_Receber"
                SET
                    "Data_Pagamento" = NULL,
                    "Observacões_Pagamento" = 'BAIXA INDEVIDA - Verificado API Asaas - ' || COALESCE("Observacões_Pagamento", ''),
                    "Total" = 0
                WHERE "ID" = ANY($1::integer[])
            `, [idsB]);

            console.log(`✅ Categoria B corrigida: ${updateB.rowCount} registros\n`);
        }

        console.log('🔄 PASSO 5: VERIFICANDO CORREÇÃO...\n');

        // Verificar correção
        const verificacao = await client.query(`
            SELECT
                "ID",
                "Codigo",
                "Valor",
                "Data_Pagamento",
                "Total",
                LEFT("Observacões_Pagamento", 100) as observacao
            FROM "Contas_Receber"
            WHERE "Observacões_Pagamento" LIKE 'BAIXA INDEVIDA%'
            ORDER BY "ID"
        `);

        console.log(`✅ Registros corrigidos: ${verificacao.rows.length}\n`);

        // Salvar relatório de registros corrigidos
        fs.writeFileSync(
            `registros_corrigidos_${timestamp}.json`,
            JSON.stringify(verificacao.rows, null, 2)
        );

        // Gerar CSV
        const csvHeader = 'ID\tCodigo\tValor\tData_Pagamento\tTotal\tObservacao\n';
        const csvContent = verificacao.rows.map(r =>
            `${r.ID}\t${r.Codigo}\t${r.Valor}\t${r.Data_Pagamento || ''}\t${r.Total}\t${r.observacao}`
        ).join('\n');

        fs.writeFileSync(
            `registros_corrigidos_${timestamp}.csv`,
            csvHeader + csvContent
        );

        console.log('📁 Relatórios gerados:');
        console.log(`   - registros_corrigidos_${timestamp}.json`);
        console.log(`   - registros_corrigidos_${timestamp}.csv\n`);

        console.log('✅ CORREÇÃO CONCLUÍDA COM SUCESSO!\n');
        console.log('📊 RESUMO:');
        console.log(`   Total corrigido: ${verificacao.rows.length} registros`);
        console.log(`   Valor total: R$ ${valorTotal.toFixed(2)}`);
        console.log(`   Backup em: Contas_Receber_Backup_20260917\n`);

        console.log('ℹ️  Para reverter a correção (se necessário):');
        console.log('   Execute o script SQL de reversão que está comentado no arquivo corrigir_baixas_indevidas.sql\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

// Executar correção
corrigirBaixasIndevidas();
