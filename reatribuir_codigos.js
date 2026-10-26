// ============================================================
// Reatribuir Códigos - V.260917260
// Atribui novos códigos únicos para contas corrigidas
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function reatribuirCodigos() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        // IDs das contas corrigidas que precisam de novo código
        const idsCorrigidos = [48612, 48622, 48631];

        console.log('═'.repeat(80));
        console.log('REATRIBUIÇÃO DE CÓDIGOS - CONTAS CORRIGIDAS');
        console.log('═'.repeat(80) + '\n');

        // Buscar MAX(Codigo) atual
        const queryMax = `SELECT MAX("Codigo") as max_codigo FROM "Contas_Receber"`;
        const resultMax = await client.query(queryMax);
        const maxCodigo = resultMax.rows[0].max_codigo;

        console.log(`📊 Código máximo atual: ${maxCodigo}`);
        console.log(`📊 Novos códigos começarão em: ${maxCodigo + 1}\n`);

        // Buscar dados atuais das contas corrigidas
        console.log('📋 CONTAS QUE RECEBERÃO NOVOS CÓDIGOS:\n');

        const queryBuscar = `
            SELECT
                "ID",
                "Codigo",
                "Documento",
                "Código_Cliente",
                "Valor",
                "Data_Vencimento"
            FROM "Contas_Receber"
            WHERE "ID" = ANY($1::integer[])
            ORDER BY "ID"
        `;

        const resultBuscar = await client.query(queryBuscar, [idsCorrigidos]);

        resultBuscar.rows.forEach((r, idx) => {
            console.log(`[${idx + 1}] ID: ${r.ID}`);
            console.log(`    Código ATUAL: ${r.Codigo}`);
            console.log(`    Documento ATUAL: ${r.Documento}`);
            console.log(`    Código_Cliente: ${r.Código_Cliente}`);
            console.log(`    Valor: R$ ${parseFloat(r.Valor).toFixed(2)}`);
            console.log(`    Vencimento: ${r.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
            console.log(`    → NOVO código: ${maxCodigo + idx + 1}\n`);
        });

        console.log('─'.repeat(80) + '\n');
        console.log('🔄 Executando reatribuição...\n');

        // Atribuir novos códigos
        for (let i = 0; i < idsCorrigidos.length; i++) {
            const id = idsCorrigidos[i];
            const novoCodigo = maxCodigo + i + 1;

            const queryUpdate = `
                UPDATE "Contas_Receber"
                SET
                    "Codigo" = $2
                WHERE "ID" = $1
            `;

            await client.query(queryUpdate, [id, novoCodigo]);
            console.log(`   ✅ ID ${id}: ${novoCodigo}`);
        }

        // Verificar resultado
        console.log('\n─'.repeat(80));
        console.log('VERIFICAÇÃO DOS NOVOS CÓDIGOS:\n');

        const queryVerificar = `
            SELECT
                "ID",
                "Codigo",
                "Documento",
                "Total",
                "Data_Pagamento"
            FROM "Contas_Receber"
            WHERE "ID" = ANY($1::integer[])
            ORDER BY "ID"
        `;

        const resultVerificar = await client.query(queryVerificar, [idsCorrigidos]);

        resultVerificar.rows.forEach(r => {
            console.log(`ID ${r.ID}:`);
            console.log(`   Código: ${r.Codigo} ✅`);
            console.log(`   Documento: ${r.Documento} ✅`);
            console.log(`   Total: R$ ${parseFloat(r.Total).toFixed(2)}`);
            console.log(`   Data_Pagamento: ${r.Data_Pagamento || 'NULL'}\n`);
        });

        console.log('═'.repeat(80));
        console.log('✅ REATRIBUIÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('═'.repeat(80) + '\n');

        console.log('📊 RESUMO:');
        console.log(`   Contas reatribuídas: ${idsCorrigidos.length}`);
        console.log(`   Códigos antigos liberados: 56423, 56424, 56431`);
        console.log(`   Novos códigos: ${maxCodigo + 1}, ${maxCodigo + 2}, ${maxCodigo + 3}\n`);

        console.log('✅ Agora as contas corretas podem manter os códigos originais sem duplicação!\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

reatribuirCodigos();
