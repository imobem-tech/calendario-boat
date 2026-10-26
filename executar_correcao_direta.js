// ============================================================
// Executar Correção Direta - V.260917230
// Corrige as contas incorretas dos códigos 56423 e 56424
// SEM confirmação (já aprovado pelo usuário)
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function executarCorrecao() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        // Contas que serão corrigidas (INCORRETAS)
        const contasIncorretas = [
            { id: 48612, codigo: 56423, cliente: 'BRUNO VERZA GARBELINI', empresa: 'SUMMER' },
            { id: 48622, codigo: 56424, cliente: 'JOSE DINIZ NOVELLO', empresa: 'ALLMAX' }
        ];

        console.log('═'.repeat(80));
        console.log('EXECUTANDO CORREÇÕES - CÓDIGOS 56423 e 56424');
        console.log('═'.repeat(80) + '\n');

        console.log('❌ Contas que serão corrigidas:\n');
        contasIncorretas.forEach(c => {
            console.log(`   - ID ${c.id}: ${c.cliente} (${c.empresa}) - Código ${c.codigo}`);
        });
        console.log();

        // Executar correções
        for (const conta of contasIncorretas) {
            console.log(`🔄 Corrigindo ID ${conta.id} (${conta.cliente})...`);

            // Primeiro buscar os dados atuais
            const queryBuscar = `
                SELECT "Observações", "Observacões_Pagamento", "Valor", "Total", "Data_Pagamento"
                FROM "Contas_Receber"
                WHERE "ID" = $1
            `;
            const resultBuscar = await client.query(queryBuscar, [conta.id]);
            const dados = resultBuscar.rows[0];

            console.log(`   Antes:`);
            console.log(`      Valor: R$ ${parseFloat(dados.Valor).toFixed(2)}`);
            console.log(`      Total: R$ ${parseFloat(dados.Total).toFixed(2)}`);
            console.log(`      Data_Pagamento: ${dados.Data_Pagamento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) || 'NULL'}`);

            // Concatenar observações
            const obsAtual = dados.Observações || '';
            const obsPagamento = dados.Observacões_Pagamento || '';
            const novaObs = obsAtual ? `${obsAtual}\n${obsPagamento}` : obsPagamento;

            // Executar UPDATE
            const queryUpdate = `
                UPDATE "Contas_Receber"
                SET
                    "Data_Pagamento" = NULL,
                    "Observações" = $2,
                    "Total" = 0
                WHERE "ID" = $1
            `;

            await client.query(queryUpdate, [conta.id, novaObs]);

            // Verificar resultado
            const queryVerificar = `
                SELECT "Total", "Data_Pagamento", "Observações"
                FROM "Contas_Receber"
                WHERE "ID" = $1
            `;
            const resultVerificar = await client.query(queryVerificar, [conta.id]);
            const verificado = resultVerificar.rows[0];

            console.log(`   Depois:`);
            console.log(`      Total: R$ ${parseFloat(verificado.Total).toFixed(2)} ✅`);
            console.log(`      Data_Pagamento: ${verificado.Data_Pagamento || 'NULL ✅'}`);
            console.log(`      Observações: ${verificado.Observações?.substring(0, 60) || '(vazio)'}...`);
            console.log(`   ✅ CORRIGIDO\n`);
        }

        console.log('═'.repeat(80));
        console.log('✅ TODAS AS CORREÇÕES FORAM EXECUTADAS COM SUCESSO!');
        console.log('═'.repeat(80) + '\n');

        console.log('📊 RESUMO:');
        console.log(`   ID 48612 (BRUNO VERZA - SUMMER): Total = 0, Data_Pagamento = NULL`);
        console.log(`   ID 48622 (JOSE DINIZ - ALLMAX): Total = 0, Data_Pagamento = NULL\n`);

        console.log('📋 PRÓXIMOS PASSOS:');
        console.log('   1. Verificar se as contas foram corrigidas corretamente');
        console.log('   2. Aplicar a mesma metodologia aos demais 65 códigos duplicados');
        console.log('   3. Gerar relatório final de todas as correções\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

executarCorrecao();
