// ============================================================
// Análise Setembro 2026 - V.2609171710
// Relaciona IDs com datas para entender cronologia
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function analiseSetembro() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('ANÁLISE DETALHADA - SETEMBRO 2026');
        console.log('═'.repeat(80) + '\n');

        // Buscar duplicações de setembro
        const querySetembro = `
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
                cr."Portador"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Documento"::text != cr."Codigo"::text
              AND cr."Data_Vencimento" >= '2026-09-01'
              AND cr."Data_Vencimento" < '2026-10-01'
            ORDER BY cr."ID"
        `;

        const resultSet = await client.query(querySetembro);
        const setembro = resultSet.rows;

        console.log(`📊 Duplicações com vencimento em SETEMBRO: ${setembro.length}\n`);

        // Buscar todas duplicações de 2026 para comparar IDs
        const queryTodas = `
            SELECT
                cr."ID",
                cr."Documento" as codigo_original,
                cr."Data_Vencimento"
            FROM "Contas_Receber" cr
            WHERE cr."Documento"::text != cr."Codigo"::text
              AND cr."Data_Vencimento" >= '2026-01-01'
              AND cr."Data_Vencimento" < '2027-01-01'
            ORDER BY cr."ID"
        `;

        const resultTodas = await client.query(queryTodas);
        const todas = resultTodas.rows;

        // Estatísticas de IDs por mês
        const estatisticasMes = {
            'junho': { min: null, max: null, count: 0 },
            'julho': { min: null, max: null, count: 0 },
            'agosto': { min: null, max: null, count: 0 },
            'setembro': { min: null, max: null, count: 0 }
        };

        todas.forEach(conta => {
            const mes = conta.Data_Vencimento?.toISOString().substring(5, 7);
            let mesNome = null;

            if (mes === '06') mesNome = 'junho';
            else if (mes === '07') mesNome = 'julho';
            else if (mes === '08') mesNome = 'agosto';
            else if (mes === '09') mesNome = 'setembro';

            if (mesNome) {
                const stat = estatisticasMes[mesNome];
                stat.count++;
                if (stat.min === null || conta.ID < stat.min) stat.min = conta.ID;
                if (stat.max === null || conta.ID > stat.max) stat.max = conta.ID;
            }
        });

        console.log('📊 COMPARAÇÃO DE IDs POR MÊS DE VENCIMENTO:\n');
        Object.entries(estatisticasMes).forEach(([mes, stat]) => {
            console.log(`${mes.toUpperCase()}:`);
            console.log(`   Quantidade: ${stat.count}`);
            console.log(`   ID mínimo: ${stat.min || 'N/A'}`);
            console.log(`   ID máximo: ${stat.max || 'N/A'}`);
            console.log(`   Range: ${stat.max && stat.min ? stat.max - stat.min : 'N/A'}`);
            console.log('');
        });

        console.log('═'.repeat(80));
        console.log('📋 TODAS AS DUPLICAÇÕES DE SETEMBRO (detalhado):\n');

        // Agrupar por código original
        const grupos = {};
        setembro.forEach(conta => {
            const cod = conta.codigo_original;
            if (!grupos[cod]) grupos[cod] = [];
            grupos[cod].push(conta);
        });

        const codigos = Object.keys(grupos).sort((a, b) => parseInt(a) - parseInt(b));

        codigos.forEach((cod, idx) => {
            const grupo = grupos[cod];

            console.log(`[${idx + 1}] CÓDIGO ORIGINAL: ${cod} (${grupo.length} duplicatas)`);
            console.log('');

            grupo.forEach((conta, cidx) => {
                console.log(`   [${cidx + 1}] ID ${conta.ID} → Código novo: ${conta.codigo_novo}`);
                console.log(`       Cliente: ${conta.Cliente_Nome || 'SEM NOME'}`);
                console.log(`       Empresa: ${conta.empresa || 'N/A'}`);
                console.log(`       Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
                console.log(`       Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);
                console.log(`       Portador: ${conta.Portador || 'N/A'}`);
                console.log(`       Pago: ${conta.Data_Pagamento ? 'SIM' : 'NÃO'}`);
                console.log('');
            });

            console.log('   ' + '─'.repeat(76));
            console.log('');
        });

        // Análise temporal: quando os IDs foram criados
        console.log('═'.repeat(80));
        console.log('💡 ANÁLISE TEMPORAL (baseado em IDs):\n');

        const idsSetembro = setembro.map(c => c.ID).sort((a, b) => a - b);
        const idMinSet = Math.min(...idsSetembro);
        const idMaxSet = Math.max(...idsSetembro);

        console.log(`IDs de setembro: ${idMinSet} até ${idMaxSet}`);
        console.log(`Range de IDs: ${idMaxSet - idMinSet}\n`);

        // Comparar com outros meses
        const comparacao = [];

        if (estatisticasMes.junho.max && estatisticasMes.junho.max < idMinSet) {
            comparacao.push('✅ Todos IDs de setembro SÃO MAIORES que junho');
            comparacao.push('   → Criadas DEPOIS de junho');
        } else {
            comparacao.push('⚠️  IDs de setembro se SOBREPÕEM com junho');
            comparacao.push('   → Algumas podem ter sido criadas junto com junho');
        }

        if (estatisticasMes.julho.max && estatisticasMes.julho.max < idMinSet) {
            comparacao.push('✅ Todos IDs de setembro SÃO MAIORES que julho');
            comparacao.push('   → Criadas DEPOIS de julho');
        } else {
            comparacao.push('⚠️  IDs de setembro se SOBREPÕEM com julho');
            comparacao.push('   → Algumas podem ter sido criadas junto com julho');
        }

        if (estatisticasMes.agosto.max && estatisticasMes.agosto.max < idMinSet) {
            comparacao.push('✅ Todos IDs de setembro SÃO MAIORES que agosto');
            comparacao.push('   → Criadas DEPOIS de agosto');
        } else {
            comparacao.push('⚠️  IDs de setembro se SOBREPÕEM com agosto');
            comparacao.push('   → Algumas podem ter sido criadas junto com agosto');
        }

        console.log(comparacao.join('\n'));
        console.log('');

        // Verificar data de hoje
        const hoje = new Date();
        const diaHoje = hoje.getDate();

        console.log('═'.repeat(80));
        console.log('📅 CONTEXTO ATUAL:\n');
        console.log(`Data de hoje: ${hoje.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
        console.log(`Dia do mês: ${diaHoje}`);
        console.log('');

        if (diaHoje < 30) {
            console.log('⚠️  SETEMBRO AINDA NÃO TERMINOU!');
            console.log('   O número de duplicações pode AUMENTAR até o fim do mês.');
            console.log('');
        }

        console.log('═'.repeat(80));
        console.log('💡 CONCLUSÕES:\n');

        if (setembro.length < estatisticasMes.julho.count) {
            const reducao = ((1 - setembro.length / estatisticasMes.julho.count) * 100).toFixed(1);
            console.log(`✅ REDUÇÃO de ${reducao}% em relação a julho`);

            if (diaHoje < 30) {
                console.log('   MAS: Setembro ainda não terminou!');
            } else {
                console.log('   Possível melhoria ou sazonalidade (menos pagamentos)');
            }
            console.log('');
        }

        // Verificar se há padrão de criação
        const idsOrdenados = idsSetembro.sort((a, b) => a - b);
        const diferencasMedias = [];
        for (let i = 1; i < idsOrdenados.length; i++) {
            diferencasMedias.push(idsOrdenados[i] - idsOrdenados[i-1]);
        }

        if (diferencasMedias.length > 0) {
            const mediaGap = diferencasMedias.reduce((a, b) => a + b, 0) / diferencasMedias.length;
            console.log(`Gap médio entre IDs: ${mediaGap.toFixed(0)}`);

            if (mediaGap < 50) {
                console.log('→ IDs muito próximos = criadas em sequência/lote');
            } else if (mediaGap > 200) {
                console.log('→ IDs espaçados = criadas ao longo do tempo');
            }
            console.log('');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

analiseSetembro();
