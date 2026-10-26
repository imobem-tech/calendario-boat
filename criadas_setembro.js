// ============================================================
// Contas Criadas em Setembro - V.2609171720
// Filtra por ID (ordem de criação) não por vencimento
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function criadasSetembro() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('CONTAS DUPLICADAS CRIADAS EM SETEMBRO 2026');
        console.log('═'.repeat(80) + '\n');

        // Primeiro, identificar o limite de IDs de agosto
        const queryLimiteAgosto = `
            SELECT MAX(cr."ID") as max_id_agosto
            FROM "Contas_Receber" cr
            WHERE cr."Documento"::text != cr."Codigo"::text
              AND cr."Data_Vencimento" >= '2026-08-01'
              AND cr."Data_Vencimento" < '2026-09-01'
        `;

        const resultLimite = await client.query(queryLimiteAgosto);
        const maxIdAgosto = resultLimite.rows[0].max_id_agosto;

        console.log(`📊 ID máximo de contas duplicadas com vencimento em AGOSTO: ${maxIdAgosto}`);
        console.log(`📊 Assumindo que contas com ID > ${maxIdAgosto} foram criadas em SETEMBRO\n`);
        console.log('─'.repeat(80) + '\n');

        // Buscar duplicações criadas em setembro (ID > max de agosto)
        const queryCriadasSet = `
            SELECT
                cr."ID",
                cr."Codigo" as codigo_novo,
                cr."Documento" as codigo_original,
                cr."Código_Cliente",
                c."Cliente_Nome",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Data_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                cr."Portador",
                cr."Observações",
                cr."Observacões_Pagamento"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Documento"::text != cr."Codigo"::text
              AND cr."ID" > $1
            ORDER BY cr."ID"
        `;

        const resultCriadas = await client.query(queryCriadasSet, [maxIdAgosto]);
        const criadas = resultCriadas.rows;

        console.log(`✅ Total de duplicações CRIADAS em setembro: ${criadas.length}\n`);

        if (criadas.length === 0) {
            console.log('🎉 NENHUMA DUPLICAÇÃO CRIADA EM SETEMBRO!\n');
            console.log('✅ O problema parece ter sido CORRIGIDO!\n');
            await client.end();
            return;
        }

        // Análise de distribuição por mês de vencimento
        const porMesVenc = {};
        criadas.forEach(conta => {
            const mes = conta.Data_Vencimento?.toISOString().substring(0, 7);
            if (!porMesVenc[mes]) porMesVenc[mes] = 0;
            porMesVenc[mes]++;
        });

        console.log('📅 DISTRIBUIÇÃO POR MÊS DE VENCIMENTO:\n');
        Object.keys(porMesVenc).sort().forEach(mes => {
            const mesNome = new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
            console.log(`   ${mesNome}: ${porMesVenc[mes]} contas`);
        });
        console.log('\n' + '─'.repeat(80) + '\n');

        // Agrupar por código original
        const grupos = {};
        criadas.forEach(conta => {
            const cod = conta.codigo_original;
            if (!grupos[cod]) grupos[cod] = [];
            grupos[cod].push(conta);
        });

        const codigos = Object.keys(grupos).sort((a, b) => parseInt(a) - parseInt(b));

        console.log('📋 TODAS AS DUPLICAÇÕES CRIADAS EM SETEMBRO:\n');

        codigos.forEach((cod, idx) => {
            const grupo = grupos[cod];

            console.log(`[${idx + 1}/${codigos.length}] CÓDIGO ORIGINAL: ${cod} (${grupo.length} duplicatas)`);
            console.log('');

            grupo.forEach((conta, cidx) => {
                console.log(`   [${cidx + 1}] ID ${conta.ID} → Código novo: ${conta.codigo_novo}`);
                console.log(`       Cliente: ${conta.Cliente_Nome || 'SEM NOME'}`);
                console.log(`       Empresa: ${conta.empresa || 'N/A'}`);
                console.log(`       Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
                console.log(`       Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);
                console.log(`       Portador: ${conta.Portador || 'N/A'}`);
                console.log(`       Pago: ${conta.Data_Pagamento ? 'SIM' : 'NÃO'}`);

                if (conta.Portador && conta.Portador.startsWith('pay_')) {
                    console.log(`       ⚠️  WEBHOOK (payment ID)`);
                }

                console.log('');
            });

            // Verificar se são clientes diferentes
            const clientes = [...new Set(grupo.map(c => c.Código_Cliente))];
            if (clientes.length > 1) {
                console.log(`   ⚠️  CLIENTES DIFERENTES: ${clientes.length} clientes distintos`);
            }

            console.log('   ' + '─'.repeat(76));
            console.log('');
        });

        // Estatísticas
        console.log('═'.repeat(80));
        console.log('📊 ESTATÍSTICAS (Criadas em Setembro):\n');

        const comPortador = criadas.filter(c => c.Portador && c.Portador.startsWith('pay_')).length;
        const semPortador = criadas.length - comPortador;

        console.log(`Total: ${criadas.length} contas`);
        console.log(`Códigos únicos: ${codigos.length}`);
        console.log('');
        console.log(`Com portador (webhook): ${comPortador} (${(comPortador/criadas.length*100).toFixed(1)}%)`);
        console.log(`Sem portador: ${semPortador} (${(semPortador/criadas.length*100).toFixed(1)}%)`);
        console.log('');

        // Verificar se clientes são diferentes
        let codigosClientesDiferentes = 0;
        codigos.forEach(cod => {
            const grupo = grupos[cod];
            const clientes = [...new Set(grupo.map(c => c.Código_Cliente))];
            if (clientes.length > 1) {
                codigosClientesDiferentes++;
            }
        });

        console.log(`Mesmo cliente: ${codigos.length - codigosClientesDiferentes} códigos`);
        console.log(`Clientes diferentes: ${codigosClientesDiferentes} códigos`);
        console.log('');

        // Range de IDs
        const ids = criadas.map(c => c.ID).sort((a, b) => a - b);
        console.log(`Range de IDs: ${ids[0]} até ${ids[ids.length-1]}`);
        console.log(`Span: ${ids[ids.length-1] - ids[0]}\n`);

        // Taxa de duplicação
        const queryTotalSetembro = `
            SELECT COUNT(*) as total
            FROM "Contas_Receber"
            WHERE "ID" > $1
        `;
        const resultTotal = await client.query(queryTotalSetembro, [maxIdAgosto]);
        const totalCriadasSet = parseInt(resultTotal.rows[0].total);

        const taxaDup = (criadas.length / totalCriadasSet * 100);
        console.log(`Total de contas criadas em setembro: ${totalCriadasSet}`);
        console.log(`Taxa de duplicação: ${taxaDup.toFixed(2)}%\n`);

        console.log('═'.repeat(80));
        console.log('💡 CONCLUSÕES:\n');

        if (comPortador / criadas.length > 0.9) {
            console.log('🚨 PROBLEMA CONTINUA ATIVO!');
            console.log(`   ${(comPortador/criadas.length*100).toFixed(1)}% das duplicações são via WEBHOOK`);
            console.log('   O problema NÃO foi corrigido em setembro\n');
        } else if (comPortador / criadas.length > 0.5) {
            console.log('⚠️  WEBHOOK AINDA É CAUSA MAJORITÁRIA');
            console.log(`   ${(comPortador/criadas.length*100).toFixed(1)}% via webhook\n`);
        }

        if (criadas.length > 0 && taxaDup > 0.5) {
            console.log(`⚠️  Taxa de duplicação de ${taxaDup.toFixed(2)}% indica problema sistêmico`);
            console.log('   Aproximadamente 1 em cada ' + Math.round(100/taxaDup) + ' contas é duplicada\n');
        }

        if (codigosClientesDiferentes > 0) {
            console.log(`⚠️  ${codigosClientesDiferentes} códigos com clientes diferentes`);
            console.log('   Indica falha no sistema de geração de códigos\n');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

criadasSetembro();
