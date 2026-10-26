// ============================================================
// Contas Criadas em Setembro (Data_Conta) - V.2609171725
// Usa campo Data_Conta para filtrar por data de criação
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
        console.log('DUPLICAÇÕES CRIADAS EM SETEMBRO 2026 (por Data_Conta)');
        console.log('═'.repeat(80) + '\n');

        // Buscar duplicações CRIADAS em setembro (Data_Conta)
        const queryCriadasSet = `
            SELECT
                cr."ID",
                cr."Codigo" as codigo_novo,
                cr."Documento" as codigo_original,
                cr."Código_Cliente",
                c."Cliente_Nome",
                cr."Data_Conta",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Data_Pagamento",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                cr."Portador"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Documento"::text != cr."Codigo"::text
              AND cr."Data_Conta" >= '2026-09-01'
              AND cr."Data_Conta" < '2026-10-01'
            ORDER BY cr."Data_Conta", cr."ID"
        `;

        const resultCriadas = await client.query(queryCriadasSet);
        const criadas = resultCriadas.rows;

        console.log(`✅ Total de duplicações CRIADAS em setembro: ${criadas.length}\n`);

        if (criadas.length === 0) {
            console.log('🎉 NENHUMA DUPLICAÇÃO CRIADA EM SETEMBRO!\n');
            console.log('✅ O problema FOI CORRIGIDO!\n');
            await client.end();
            return;
        }

        // Análise por dia
        const porDia = {};
        criadas.forEach(conta => {
            const dia = conta.Data_Conta?.toISOString().substring(0, 10);
            if (!porDia[dia]) porDia[dia] = [];
            porDia[dia].push(conta);
        });

        console.log('📅 DISTRIBUIÇÃO POR DIA DE CRIAÇÃO:\n');
        Object.keys(porDia).sort().forEach(dia => {
            const diaFormatado = new Date(dia + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
            console.log(`   ${diaFormatado}: ${porDia[dia].length} contas`);
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
                console.log(`       🗓️  Criada em: ${conta.Data_Conta?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
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

            // Verificar se foram criadas no mesmo dia
            const dias = [...new Set(grupo.map(c => c.Data_Conta?.toISOString().substring(0, 10)))];
            if (dias.length === 1) {
                console.log(`   📅 Todas criadas no MESMO DIA`);
            } else {
                console.log(`   📅 Criadas em ${dias.length} dias diferentes`);
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
        console.log(`Dias com duplicações: ${Object.keys(porDia).length}`);
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

        // Taxa de duplicação
        const queryTotalSetembro = `
            SELECT COUNT(*) as total
            FROM "Contas_Receber"
            WHERE "Data_Conta" >= '2026-09-01'
              AND "Data_Conta" < '2026-10-01'
        `;
        const resultTotal = await client.query(queryTotalSetembro);
        const totalCriadasSet = parseInt(resultTotal.rows[0].total);

        const taxaDup = (criadas.length / totalCriadasSet * 100);
        console.log(`Total de contas criadas em setembro: ${totalCriadasSet}`);
        console.log(`Taxa de duplicação: ${taxaDup.toFixed(2)}%\n`);

        // Dia com mais duplicações
        const diasOrdenados = Object.entries(porDia).sort((a, b) => b[1].length - a[1].length);
        if (diasOrdenados.length > 0) {
            const [diaPico, contasPico] = diasOrdenados[0];
            const diaFormatado = new Date(diaPico + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
            console.log(`Dia com mais duplicações: ${diaFormatado} (${contasPico.length} contas)\n`);
        }

        console.log('═'.repeat(80));
        console.log('💡 CONCLUSÕES:\n');

        if (criadas.length === 0) {
            console.log('🎉 PROBLEMA RESOLVIDO EM SETEMBRO!');
            console.log('   Nenhuma duplicação foi criada este mês\n');
        } else if (comPortador / criadas.length > 0.9) {
            console.log('🚨 PROBLEMA CONTINUA ATIVO EM SETEMBRO!');
            console.log(`   ${(comPortador/criadas.length*100).toFixed(1)}% das duplicações são via WEBHOOK`);
            console.log('   O problema NÃO foi corrigido\n');
        } else if (comPortador / criadas.length > 0.5) {
            console.log('⚠️  WEBHOOK AINDA É CAUSA MAJORITÁRIA');
            console.log(`   ${(comPortador/criadas.length*100).toFixed(1)}% via webhook\n`);
        }

        if (criadas.length > 0 && taxaDup > 0.5) {
            console.log(`⚠️  Taxa de duplicação de ${taxaDup.toFixed(2)}%`);
            console.log('   Aproximadamente 1 em cada ' + Math.round(100/taxaDup) + ' contas é duplicada\n');
        }

        if (codigosClientesDiferentes > 0) {
            const percDif = (codigosClientesDiferentes / codigos.length * 100);
            console.log(`⚠️  ${codigosClientesDiferentes} códigos com clientes diferentes (${percDif.toFixed(1)}%)`);
            console.log('   Confirma falha no sistema de geração de códigos via webhook\n');
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
