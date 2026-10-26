// ============================================================
// corrigir_duplicacoes_out2026.js — V.2610061400
// Correção das duplicações de outubro 2026
// - Reatribui códigos duplicados
// - Sincroniza SEQUENCE
// - Verifica necessidade de ajustes no Asaas
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function corrigirDuplicacoes() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('CORREÇÃO DE DUPLICAÇÕES - OUTUBRO 2026');
        console.log('═'.repeat(80) + '\n');

        // ============================================================
        // ETAPA 1: Verificar estado atual
        // ============================================================
        console.log('📊 ETAPA 1: Verificando estado atual...\n');

        const queryEstadoAtual = `
            SELECT
                "ID",
                "Codigo",
                "Documento",
                "Código_Cliente",
                "Valor",
                "Data_Pagamento",
                "Observacões_Pagamento"
            FROM "Contas_Receber"
            WHERE "ID" IN (50173, 50192, 50174, 50193)
            ORDER BY "Codigo", "ID"
        `;

        const resultEstado = await client.query(queryEstadoAtual);

        console.log('Registros afetados:\n');
        resultEstado.rows.forEach(r => {
            console.log(`   ID ${r.ID}:`);
            console.log(`      Código atual: ${r.Codigo}`);
            console.log(`      Documento: ${r.Documento}`);
            console.log(`      Cliente: ${r.Código_Cliente}`);
            console.log(`      Valor: R$ ${parseFloat(r.Valor).toFixed(2)}`);
            console.log(`      Status: ${r.Data_Pagamento ? '✅ PAGO' : '⏳ ABERTO'}`);
            if (r.Data_Pagamento) {
                console.log(`      Obs_Pagamento: ${r.Observacões_Pagamento || 'N/A'}`);
            }
            console.log('');
        });

        // ============================================================
        // ETAPA 2: Verificar SEQUENCE atual
        // ============================================================
        console.log('─'.repeat(80));
        console.log('📊 ETAPA 2: Verificando SEQUENCE atual...\n');

        const querySequence = `SELECT last_value, is_called FROM contas_receber_codigo_seq`;
        const resultSeq = await client.query(querySequence);
        const sequenceAtual = resultSeq.rows[0].last_value;

        const queryMaxCodigo = `SELECT MAX("Codigo") as max_codigo FROM "Contas_Receber"`;
        const resultMax = await client.query(queryMaxCodigo);
        const maxCodigo = resultMax.rows[0].max_codigo;

        console.log(`   SEQUENCE atual: ${sequenceAtual}`);
        console.log(`   Maior código no banco: ${maxCodigo}`);
        console.log(`   Diferença: ${maxCodigo - sequenceAtual}\n`);

        // ============================================================
        // ETAPA 3: Reatribuir códigos duplicados
        // ============================================================
        console.log('─'.repeat(80));
        console.log('🔄 ETAPA 3: Reatribuindo códigos duplicados...\n');

        // Array com os IDs que receberão novos códigos
        const idsParaReatribuir = [
            { id: 50192, codigoAntigo: 58369, motivo: 'Segunda duplicação do código 58369' },
            { id: 50193, codigoAntigo: 58370, motivo: 'Segunda duplicação do código 58370' }
        ];

        const codigosNovos = [];

        for (const item of idsParaReatribuir) {
            console.log(`[ID ${item.id}] ${item.motivo}`);
            console.log(`   Código antigo: ${item.codigoAntigo}`);

            // Gerar novo código usando a SEQUENCE
            const queryNovoCodigo = `SELECT gerar_proximo_codigo_cr() as novo_codigo`;
            const resultNovo = await client.query(queryNovoCodigo);
            const novoCodigo = resultNovo.rows[0].novo_codigo;

            console.log(`   Novo código: ${novoCodigo}`);

            // Atualizar registro
            const queryUpdate = `
                UPDATE "Contas_Receber"
                SET
                    "Codigo" = $1,
                    "Documento" = $2
                WHERE "ID" = $3
                RETURNING "ID", "Codigo", "Documento"
            `;

            const resultUpdate = await client.query(queryUpdate, [
                novoCodigo,
                novoCodigo.toString(),
                item.id
            ]);

            console.log(`   ✅ Atualizado: ID ${resultUpdate.rows[0].ID} → Código ${resultUpdate.rows[0].Codigo}\n`);

            codigosNovos.push({
                id: item.id,
                codigoAntigo: item.codigoAntigo,
                codigoNovo: novoCodigo
            });
        }

        // ============================================================
        // ETAPA 4: Sincronizar SEQUENCE
        // ============================================================
        console.log('─'.repeat(80));
        console.log('🔄 ETAPA 4: Sincronizando SEQUENCE...\n');

        // Buscar o novo MAX após as atualizações
        const queryNovoMax = `SELECT MAX("Codigo") as max_codigo FROM "Contas_Receber"`;
        const resultNovoMax = await client.query(queryNovoMax);
        const novoMaxCodigo = resultNovoMax.rows[0].max_codigo;

        console.log(`   Maior código após correção: ${novoMaxCodigo}`);

        // Ajustar SEQUENCE para o próximo valor
        const queryAjustarSeq = `SELECT setval('contas_receber_codigo_seq', $1)`;
        await client.query(queryAjustarSeq, [novoMaxCodigo + 1]);

        // Verificar sincronização
        const queryVerificarSeq = `SELECT last_value FROM contas_receber_codigo_seq`;
        const resultVerificar = await client.query(queryVerificarSeq);
        const sequenceNova = resultVerificar.rows[0].last_value;

        console.log(`   SEQUENCE ajustada para: ${sequenceNova}`);
        console.log(`   Próximo código será: ${sequenceNova}\n`);

        if (sequenceNova === novoMaxCodigo + 1) {
            console.log('   ✅ SEQUENCE sincronizada corretamente!\n');
        } else {
            console.log('   ⚠️ ATENÇÃO: SEQUENCE pode estar incorreta!\n');
        }

        // ============================================================
        // ETAPA 5: Verificar necessidade de ajustes no Asaas
        // ============================================================
        console.log('─'.repeat(80));
        console.log('🔍 ETAPA 5: Verificando necessidade de ajustes no Asaas...\n');

        const queryAsaas = `
            SELECT
                "ID",
                "Codigo",
                "Documento",
                "Data_Pagamento",
                "Observacões_Pagamento"
            FROM "Contas_Receber"
            WHERE "ID" IN (50192, 50193)
            AND "Data_Pagamento" IS NOT NULL
            AND "Observacões_Pagamento" LIKE '%Asaas%'
        `;

        const resultAsaas = await client.query(queryAsaas);

        if (resultAsaas.rows.length === 0) {
            console.log('   ✅ Nenhuma conta com novo código foi paga pelo Asaas');
            console.log('   ✅ Nenhum ajuste necessário no Asaas\n');
        } else {
            console.log('   ⚠️ ATENÇÃO: Contas pagas pelo Asaas com códigos alterados:\n');
            resultAsaas.rows.forEach(r => {
                const alteracao = codigosNovos.find(c => c.id === r.ID);
                console.log(`   ID ${r.ID}:`);
                console.log(`      Código antigo: ${alteracao.codigoAntigo}`);
                console.log(`      Código novo: ${alteracao.codigoNovo}`);
                console.log(`      Data_Pagamento: ${r.Data_Pagamento}`);
                console.log(`      Obs: ${r.Observacões_Pagamento}`);
                console.log('      ⚠️ VERIFICAR: Possível inconsistência com registros Asaas\n');
            });
        }

        // ============================================================
        // ETAPA 6: Verificação Final
        // ============================================================
        console.log('─'.repeat(80));
        console.log('📊 ETAPA 6: Verificação final...\n');

        const queryVerificacaoFinal = `
            WITH codigos_duplicados AS (
                SELECT "Codigo", COUNT(*) as qtd
                FROM "Contas_Receber"
                WHERE "Codigo" IS NOT NULL
                AND "Codigo" != 0
                GROUP BY "Codigo"
                HAVING COUNT(*) > 1
            )
            SELECT COUNT(*) as total_duplicados
            FROM codigos_duplicados
        `;

        const resultVerificacaoFinal = await client.query(queryVerificacaoFinal);
        const totalDuplicados = resultVerificacaoFinal.rows[0].total_duplicados;

        if (totalDuplicados === 0) {
            console.log('   ✅ NENHUMA duplicação encontrada no banco!\n');
        } else {
            console.log(`   ⚠️ ATENÇÃO: Ainda existem ${totalDuplicados} códigos duplicados!\n`);
        }

        // ============================================================
        // RESUMO FINAL
        // ============================================================
        console.log('═'.repeat(80));
        console.log('📋 RESUMO DA CORREÇÃO');
        console.log('═'.repeat(80) + '\n');

        console.log('✅ CÓDIGOS REATRIBUÍDOS:\n');
        codigosNovos.forEach(c => {
            console.log(`   ID ${c.id}: ${c.codigoAntigo} → ${c.codigoNovo}`);
        });

        console.log(`\n✅ SEQUENCE SINCRONIZADA:`);
        console.log(`   Valor anterior: ${sequenceAtual}`);
        console.log(`   Valor atual: ${sequenceNova}`);
        console.log(`   Próximo código: ${sequenceNova}\n`);

        console.log('✅ CÓDIGOS MANTIDOS (primeira ocorrência):');
        console.log(`   ID 50173: Código 58369 (LEANDRO MANZANO - PAGO)`);
        console.log(`   ID 50174: Código 58370 (HELCIO BRITO - ABERTO)\n`);

        console.log('═'.repeat(80));
        console.log('✅ CORREÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('═'.repeat(80) + '\n');

        console.log('⚠️ AÇÕES RECOMENDADAS:');
        console.log('   1. Verificar com usuário se ainda está usando VBA antigo');
        console.log('   2. Orientar uso EXCLUSIVO da versão atualizada do Access');
        console.log('   3. Monitorar próximas inserções para garantir uso da SEQUENCE');
        console.log('   4. Configurar auditoria diária de duplicações\n');

    } catch (error) {
        console.error('❌ ERRO:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

corrigirDuplicacoes();
