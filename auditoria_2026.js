// ============================================================
// Auditoria de Duplicações 2026 - V.2609171700
// Analisa apenas contas com vencimento em 2026
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function auditoria2026() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('AUDITORIA DE DUPLICAÇÕES - ANO 2026');
        console.log('═'.repeat(80) + '\n');

        // Buscar contas reatribuídas de 2026
        const queryReatribuidas = `
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
              AND cr."Data_Vencimento" >= '2026-01-01'
              AND cr."Data_Vencimento" < '2027-01-01'
            ORDER BY cr."Documento", cr."ID"
        `;

        console.log('🔍 Buscando contas reatribuídas de 2026...\n');
        const result = await client.query(queryReatribuidas);
        const contas = result.rows;

        console.log(`📊 Total de contas reatribuídas em 2026: ${contas.length}\n`);

        if (contas.length === 0) {
            console.log('✅ Nenhuma duplicação em 2026!\n');
            console.log('🎉 O problema parece ter sido resolvido ou não afeta contas novas!\n');
            await client.end();
            return;
        }

        // Agrupar por código original
        const grupos = {};
        contas.forEach(conta => {
            const codOriginal = conta.codigo_original;
            if (!grupos[codOriginal]) {
                grupos[codOriginal] = [];
            }
            grupos[codOriginal].push(conta);
        });

        const codigosOriginais = Object.keys(grupos).sort((a, b) => parseInt(a) - parseInt(b));

        console.log(`📋 Códigos originais duplicados em 2026: ${codigosOriginais.length}\n`);
        console.log('═'.repeat(80) + '\n');

        // Análise de padrões
        const analise = {
            total_codigos: codigosOriginais.length,
            total_contas: contas.length,
            padroes: {
                por_empresa: {},
                por_quantidade: {},
                por_mes: {},
                com_portador: 0,
                sem_portador: 0,
                com_pagamento: 0,
                sem_pagamento: 0,
                mesmo_cliente: 0,
                clientes_diferentes: 0,
                pagamentos_asaas: 0
            }
        };

        // Analisar cada grupo
        codigosOriginais.forEach(codOriginal => {
            const grupo = grupos[codOriginal];
            const qtd = grupo.length;

            // Contagem por quantidade
            if (!analise.padroes.por_quantidade[qtd]) {
                analise.padroes.por_quantidade[qtd] = 0;
            }
            analise.padroes.por_quantidade[qtd]++;

            // Analisar empresas e meses
            grupo.forEach(conta => {
                const empresa = conta.empresa || 'SEM_EMPRESA';
                if (!analise.padroes.por_empresa[empresa]) {
                    analise.padroes.por_empresa[empresa] = 0;
                }
                analise.padroes.por_empresa[empresa]++;

                // Mês
                const mes = conta.Data_Vencimento?.toISOString().substring(0, 7); // YYYY-MM
                if (mes) {
                    if (!analise.padroes.por_mes[mes]) {
                        analise.padroes.por_mes[mes] = 0;
                    }
                    analise.padroes.por_mes[mes]++;
                }

                // Portador (webhook)
                if (conta.Portador && conta.Portador.startsWith('pay_')) {
                    analise.padroes.com_portador++;
                    analise.padroes.pagamentos_asaas++;
                } else {
                    analise.padroes.sem_portador++;
                }

                // Pagamento
                if (conta.Data_Pagamento) {
                    analise.padroes.com_pagamento++;
                } else {
                    analise.padroes.sem_pagamento++;
                }
            });

            // Verificar se são do mesmo cliente
            const clientes = [...new Set(grupo.map(c => c.Código_Cliente))];
            if (clientes.length === 1) {
                analise.padroes.mesmo_cliente++;
            } else {
                analise.padroes.clientes_diferentes++;
            }
        });

        // Exibir análise
        console.log('📊 ANÁLISE DE PADRÕES (2026):\n');

        console.log('1. DISTRIBUIÇÃO POR QUANTIDADE:');
        Object.keys(analise.padroes.por_quantidade).sort((a, b) => parseInt(a) - parseInt(b)).forEach(qtd => {
            const count = analise.padroes.por_quantidade[qtd];
            console.log(`   ${qtd} duplicatas: ${count} códigos (${(count/analise.total_codigos*100).toFixed(1)}%)`);
        });
        console.log('');

        console.log('2. DISTRIBUIÇÃO POR EMPRESA:');
        Object.keys(analise.padroes.por_empresa).sort((a, b) =>
            analise.padroes.por_empresa[b] - analise.padroes.por_empresa[a]
        ).forEach(empresa => {
            const count = analise.padroes.por_empresa[empresa];
            console.log(`   ${empresa}: ${count} contas (${(count/analise.total_contas*100).toFixed(1)}%)`);
        });
        console.log('');

        console.log('3. DISTRIBUIÇÃO POR MÊS:');
        Object.keys(analise.padroes.por_mes).sort().forEach(mes => {
            const count = analise.padroes.por_mes[mes];
            const mesNome = new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
            console.log(`   ${mesNome}: ${count} contas (${(count/analise.total_contas*100).toFixed(1)}%)`);
        });
        console.log('');

        console.log('4. PORTADOR (WEBHOOK):');
        console.log(`   Com portador (payment ID): ${analise.padroes.com_portador} (${(analise.padroes.com_portador/analise.total_contas*100).toFixed(1)}%)`);
        console.log(`   Sem portador: ${analise.padroes.sem_portador} (${(analise.padroes.sem_portador/analise.total_contas*100).toFixed(1)}%)`);
        console.log('');

        console.log('5. PAGAMENTO:');
        console.log(`   Com pagamento: ${analise.padroes.com_pagamento} (${(analise.padroes.com_pagamento/analise.total_contas*100).toFixed(1)}%)`);
        console.log(`   Sem pagamento: ${analise.padroes.sem_pagamento} (${(analise.padroes.sem_pagamento/analise.total_contas*100).toFixed(1)}%)`);
        console.log('');

        console.log('6. CLIENTES:');
        console.log(`   Mesmo cliente nas duplicatas: ${analise.padroes.mesmo_cliente} códigos`);
        console.log(`   Clientes diferentes: ${analise.padroes.clientes_diferentes} códigos`);
        console.log('');

        // Mostrar todos os códigos duplicados de 2026
        console.log('═'.repeat(80));
        console.log('📋 TODOS OS CÓDIGOS DUPLICADOS DE 2026:\n');

        codigosOriginais.forEach((codOriginal, idx) => {
            const grupo = grupos[codOriginal];

            console.log(`[${idx + 1}] CÓDIGO ORIGINAL: ${codOriginal} (${grupo.length} duplicatas)`);

            grupo.forEach((conta, cidx) => {
                console.log(`   [${cidx + 1}] ID ${conta.ID} → Novo: ${conta.codigo_novo}`);
                console.log(`       Cliente: ${conta.Cliente_Nome || 'SEM NOME'}`);
                console.log(`       Empresa: ${conta.empresa || 'N/A'}`);
                console.log(`       Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
                console.log(`       Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);
                console.log(`       Portador: ${conta.Portador || 'N/A'}`);
                console.log(`       Pago: ${conta.Data_Pagamento ? 'SIM' : 'NÃO'}`);
            });
            console.log('');
        });

        // Salvar relatório
        const relatorio = {
            ano: 2026,
            timestamp: new Date().toISOString(),
            analise: analise,
            grupos: codigosOriginais.map(cod => ({
                codigo_original: cod,
                contas: grupos[cod].map(c => ({
                    id: c.ID,
                    codigo_novo: c.codigo_novo,
                    cliente: c.Cliente_Nome,
                    empresa: c.empresa,
                    vencimento: c.Data_Vencimento,
                    valor: parseFloat(c.Valor),
                    portador: c.Portador,
                    data_pagamento: c.Data_Pagamento
                }))
            }))
        };

        const nomeRelatorio = `auditoria_2026_${Date.now()}.json`;
        fs.writeFileSync(nomeRelatorio, JSON.stringify(relatorio, null, 2));

        console.log('═'.repeat(80));
        console.log('✅ AUDITORIA 2026 CONCLUÍDA!');
        console.log('═'.repeat(80) + '\n');
        console.log(`📄 Relatório: ${nomeRelatorio}\n`);

        // CONCLUSÕES
        console.log('═'.repeat(80));
        console.log('💡 CONCLUSÕES:\n');

        const percComPortador = (analise.padroes.com_portador / analise.total_contas * 100);
        if (percComPortador > 50) {
            console.log('⚠️  ALTA CORRELAÇÃO COM WEBHOOKS EM 2026:');
            console.log(`   ${percComPortador.toFixed(1)}% das duplicações têm payment ID`);
            console.log('   Possível causa: Webhook do Asaas disparando múltiplas vezes\n');
        } else if (percComPortador > 10) {
            console.log('⚠️  CORRELAÇÃO MODERADA COM WEBHOOKS:');
            console.log(`   ${percComPortador.toFixed(1)}% têm payment ID`);
            console.log('   Webhooks podem ser PARTE do problema\n');
        } else {
            console.log('✅ BAIXA CORRELAÇÃO COM WEBHOOKS:');
            console.log(`   Apenas ${percComPortador.toFixed(1)}% têm payment ID`);
            console.log('   Webhooks NÃO são a causa principal\n');
        }

        if (analise.padroes.clientes_diferentes > 0) {
            console.log('⚠️  CLIENTES DIFERENTES:');
            console.log(`   ${analise.padroes.clientes_diferentes} códigos com clientes diferentes`);
            console.log('   Indica problema na geração de código (autonumeração)\n');
        }

        // Identificar mês com mais problemas
        const mesesOrdenados = Object.entries(analise.padroes.por_mes)
            .sort((a, b) => b[1] - a[1]);

        if (mesesOrdenados.length > 0) {
            const [mesPico, contasPico] = mesesOrdenados[0];
            const mesNome = new Date(mesPico + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
            console.log('📅 MÊS COM MAIS DUPLICAÇÕES:');
            console.log(`   ${mesNome}: ${contasPico} contas (${(contasPico/analise.total_contas*100).toFixed(1)}%)\n`);
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

auditoria2026();
