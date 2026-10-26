// ============================================================
// analise_duplicacoes_outubro_2026.js — V.2610061345
// Análise de códigos duplicados a partir de 01/10/2026
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

async function analisarDuplicacoesOutubro() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('ANÁLISE DE DUPLICAÇÕES - CONTAS CRIADAS A PARTIR DE 01/10/2026');
        console.log('═'.repeat(80) + '\n');

        // 1. Buscar TODOS os registros com Data_Conta >= 01/10/2026
        console.log('📊 ETAPA 1: Buscando todas as contas com Data_Conta >= 01/10/2026...\n');

        const queryTodasContas = `
            SELECT
                "ID",
                "Codigo",
                "Documento",
                "Código_Cliente",
                "Valor",
                "Total",
                "Data_Conta",
                "Data_Vencimento",
                "Data_Pagamento",
                "Observacões_Pagamento",
                "Centro_Custo"
            FROM "Contas_Receber"
            WHERE "Data_Conta" >= '2026-10-01'::date
            ORDER BY "Codigo", "ID"
        `;

        const resultTodas = await client.query(queryTodasContas);
        console.log(`   Total de contas com Data_Conta >= 01/10/2026: ${resultTodas.rows.length}\n`);

        // 2. Identificar códigos duplicados
        console.log('📊 ETAPA 2: Identificando códigos duplicados...\n');

        const queryDuplicados = `
            WITH codigos_duplicados AS (
                SELECT "Codigo", COUNT(*) as qtd
                FROM "Contas_Receber"
                WHERE "Data_Conta" >= '2026-10-01'::date
                AND "Codigo" IS NOT NULL
                AND "Codigo" != 0
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
                cr."Valor",
                cr."Total",
                cr."Data_Conta",
                cr."Data_Vencimento",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                cd.qtd as total_duplicacoes
            FROM "Contas_Receber" cr
            INNER JOIN codigos_duplicados cd ON cr."Codigo" = cd."Codigo"
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Data_Conta" >= '2026-10-01'::date
            ORDER BY cr."Codigo", cr."ID"
        `;

        const resultDuplicados = await client.query(queryDuplicados);

        if (resultDuplicados.rows.length === 0) {
            console.log('✅ NENHUMA DUPLICAÇÃO ENCONTRADA!\n');
            console.log('   A SEQUENCE está funcionando corretamente! 🎉\n');
            console.log('═'.repeat(80));
            return;
        }

        console.log(`⚠️  DUPLICAÇÕES ENCONTRADAS: ${resultDuplicados.rows.length} registros afetados\n`);

        // Agrupar por código
        const porCodigo = {};
        resultDuplicados.rows.forEach(r => {
            if (!porCodigo[r.Codigo]) {
                porCodigo[r.Codigo] = [];
            }
            porCodigo[r.Codigo].push(r);
        });

        const codigosDuplicados = Object.keys(porCodigo).sort((a, b) => parseInt(a) - parseInt(b));

        console.log('═'.repeat(80));
        console.log(`CÓDIGOS DUPLICADOS: ${codigosDuplicados.length}`);
        console.log('═'.repeat(80) + '\n');

        // 3. Análise detalhada de cada código duplicado
        codigosDuplicados.forEach(codigo => {
            const registros = porCodigo[codigo];

            console.log('─'.repeat(80));
            console.log(`CÓDIGO: ${codigo} (${registros.length} duplicações)`);
            console.log('─'.repeat(80));

            registros.forEach((r, idx) => {
                console.log(`\n[${idx + 1}/${registros.length}] ID: ${r.ID}`);
                console.log(`      Documento: ${r.Documento || 'N/A'}`);
                console.log(`      Cliente: [${r.Código_Cliente || 'N/A'}] ${r.Cliente_Nome || 'SEM CADASTRO'}`);
                console.log(`      CPF: ${r.Cliente_CPF || 'N/A'}`);
                console.log(`      Empresa: ${r.empresa || 'NÃO IDENTIFICADA'} (Centro_Custo: ${r.Centro_Custo})`);
                console.log(`      Valor: R$ ${parseFloat(r.Valor || 0).toFixed(2)}`);
                console.log(`      Total: R$ ${parseFloat(r.Total || 0).toFixed(2)}`);
                console.log(`      Data_Conta: ${r.Data_Conta ? new Date(r.Data_Conta).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : 'N/A'}`);
                console.log(`      Vencimento: ${r.Data_Vencimento ? new Date(r.Data_Vencimento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : 'N/A'}`);
                console.log(`      Status: ${r.Data_Pagamento ? '✅ PAGO' : '⏳ ABERTO'}`);
                if (r.Data_Pagamento) {
                    console.log(`      Data_Pagamento: ${new Date(r.Data_Pagamento).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
                    console.log(`      Obs_Pagamento: ${r.Observacões_Pagamento || 'N/A'}`);
                }
            });

            console.log('\n');
        });

        // 4. Análise de origem das duplicações
        console.log('═'.repeat(80));
        console.log('📊 ANÁLISE DE ORIGEM DAS DUPLICAÇÕES');
        console.log('═'.repeat(80) + '\n');

        const comAsaas = resultDuplicados.rows.filter(r =>
            r.Observacões_Pagamento && r.Observacões_Pagamento.includes('Asaas')
        ).length;

        const semAsaas = resultDuplicados.rows.filter(r =>
            !r.Observacões_Pagamento || !r.Observacões_Pagamento.includes('Asaas')
        ).length;

        const pagas = resultDuplicados.rows.filter(r => r.Data_Pagamento).length;
        const abertas = resultDuplicados.rows.filter(r => !r.Data_Pagamento).length;

        console.log(`   Total de registros duplicados: ${resultDuplicados.rows.length}`);
        console.log(`   ├─ Com baixa pelo Asaas: ${comAsaas}`);
        console.log(`   └─ Sem baixa pelo Asaas: ${semAsaas}`);
        console.log(`   `);
        console.log(`   ├─ Contas PAGAS: ${pagas}`);
        console.log(`   └─ Contas ABERTAS: ${abertas}\n`);

        // 5. Verificar se a SEQUENCE está sendo usada
        console.log('═'.repeat(80));
        console.log('🔍 VERIFICANDO USO DA SEQUENCE');
        console.log('═'.repeat(80) + '\n');

        const querySequence = `
            SELECT last_value, is_called
            FROM contas_receber_codigo_seq
        `;

        const resultSeq = await client.query(querySequence);
        console.log(`   SEQUENCE atual: ${resultSeq.rows[0].last_value}`);
        console.log(`   SEQUENCE foi usada: ${resultSeq.rows[0].is_called ? 'SIM' : 'NÃO'}\n`);

        // Verificar maior código no banco
        const queryMaxCodigo = `
            SELECT MAX("Codigo") as max_codigo
            FROM "Contas_Receber"
        `;

        const resultMax = await client.query(queryMaxCodigo);
        console.log(`   Maior código no banco: ${resultMax.rows[0].max_codigo}\n`);

        if (resultSeq.rows[0].last_value < resultMax.rows[0].max_codigo) {
            console.log('   ⚠️  ALERTA: SEQUENCE está DESATUALIZADA!');
            console.log('   ⚠️  Códigos estão sendo gerados SEM usar a SEQUENCE!\n');
        } else {
            console.log('   ✅ SEQUENCE está sincronizada com o banco\n');
        }

        console.log('═'.repeat(80));
        console.log('✅ ANÁLISE CONCLUÍDA');
        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

analisarDuplicacoesOutubro();
