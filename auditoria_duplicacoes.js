// ============================================================
// Auditoria de Duplicações - V.2609171650
// Investiga a causa das duplicações usando campo Documento
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function auditoriaDuplicacoes() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('AUDITORIA DE DUPLICAÇÕES - INVESTIGAÇÃO DE CAUSA');
        console.log('═'.repeat(80) + '\n');

        // Buscar contas reatribuídas (Documento != Codigo)
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
            ORDER BY cr."Documento", cr."ID"
        `;

        console.log('🔍 Buscando contas reatribuídas...\n');
        const result = await client.query(queryReatribuidas);
        const contas = result.rows;

        console.log(`📊 Total de contas reatribuídas: ${contas.length}\n`);

        // Agrupar por código original (Documento)
        const grupos = {};
        contas.forEach(conta => {
            const codOriginal = conta.codigo_original;
            if (!grupos[codOriginal]) {
                grupos[codOriginal] = [];
            }
            grupos[codOriginal].push(conta);
        });

        const codigosOriginais = Object.keys(grupos).sort((a, b) => parseInt(a) - parseInt(b));

        console.log(`📋 Códigos originais duplicados: ${codigosOriginais.length}\n`);
        console.log('═'.repeat(80) + '\n');

        // Análise de padrões
        const analise = {
            total_codigos: codigosOriginais.length,
            total_contas: contas.length,
            padroes: {
                por_empresa: {},
                por_quantidade: {},
                com_portador: 0,
                sem_portador: 0,
                com_pagamento: 0,
                sem_pagamento: 0,
                mesmo_cliente: 0,
                clientes_diferentes: 0
            },
            exemplos: []
        };

        // Analisar cada grupo
        codigosOriginais.forEach((codOriginal, idx) => {
            const grupo = grupos[codOriginal];
            const qtd = grupo.length;

            // Contagem por quantidade
            if (!analise.padroes.por_quantidade[qtd]) {
                analise.padroes.por_quantidade[qtd] = 0;
            }
            analise.padroes.por_quantidade[qtd]++;

            // Analisar empresas
            grupo.forEach(conta => {
                const empresa = conta.empresa || 'SEM_EMPRESA';
                if (!analise.padroes.por_empresa[empresa]) {
                    analise.padroes.por_empresa[empresa] = 0;
                }
                analise.padroes.por_empresa[empresa]++;

                // Portador (webhook)
                if (conta.Portador && conta.Portador.startsWith('pay_')) {
                    analise.padroes.com_portador++;
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

            // Guardar exemplos (primeiros 10)
            if (idx < 10) {
                analise.exemplos.push({
                    codigo_original: codOriginal,
                    quantidade: qtd,
                    contas: grupo.map(c => ({
                        id: c.ID,
                        codigo_novo: c.codigo_novo,
                        cliente: c.Cliente_Nome,
                        empresa: c.empresa,
                        vencimento: c.Data_Vencimento,
                        valor: parseFloat(c.Valor),
                        portador: c.Portador,
                        data_pagamento: c.Data_Pagamento
                    }))
                });
            }
        });

        // Exibir análise
        console.log('📊 ANÁLISE DE PADRÕES:\n');

        console.log('1. DISTRIBUIÇÃO POR QUANTIDADE DE DUPLICATAS:');
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

        console.log('3. PORTADOR (WEBHOOK):');
        console.log(`   Com portador (payment ID): ${analise.padroes.com_portador} (${(analise.padroes.com_portador/analise.total_contas*100).toFixed(1)}%)`);
        console.log(`   Sem portador: ${analise.padroes.sem_portador} (${(analise.padroes.sem_portador/analise.total_contas*100).toFixed(1)}%)`);
        console.log('');

        console.log('4. PAGAMENTO:');
        console.log(`   Com pagamento: ${analise.padroes.com_pagamento} (${(analise.padroes.com_pagamento/analise.total_contas*100).toFixed(1)}%)`);
        console.log(`   Sem pagamento: ${analise.padroes.sem_pagamento} (${(analise.padroes.sem_pagamento/analise.total_contas*100).toFixed(1)}%)`);
        console.log('');

        console.log('5. CLIENTES:');
        console.log(`   Mesmo cliente nas duplicatas: ${analise.padroes.mesmo_cliente} códigos`);
        console.log(`   Clientes diferentes: ${analise.padroes.clientes_diferentes} códigos`);
        console.log('');

        // Mostrar exemplos
        console.log('═'.repeat(80));
        console.log('📋 EXEMPLOS DE DUPLICAÇÕES (primeiros 10):\n');

        analise.exemplos.forEach((exemplo, idx) => {
            console.log(`[${idx + 1}] CÓDIGO ORIGINAL: ${exemplo.codigo_original} (${exemplo.quantidade} duplicatas)`);
            console.log('');

            exemplo.contas.forEach((conta, cidx) => {
                console.log(`   [${cidx + 1}] ID ${conta.id} → Novo código: ${conta.codigo_novo}`);
                console.log(`       Cliente: ${conta.cliente || 'SEM NOME'}`);
                console.log(`       Empresa: ${conta.empresa}`);
                console.log(`       Vencimento: ${conta.vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
                console.log(`       Valor: R$ ${conta.valor.toFixed(2)}`);
                console.log(`       Portador: ${conta.portador || 'N/A'}`);
                console.log(`       Pago em: ${conta.data_pagamento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) || 'NÃO PAGO'}`);
                console.log('');
            });

            console.log('   ' + '─'.repeat(76));
            console.log('');
        });

        // Salvar relatório completo
        const relatorio = {
            timestamp: new Date().toISOString(),
            analise: analise,
            grupos_completos: codigosOriginais.map(cod => ({
                codigo_original: cod,
                contas: grupos[cod].map(c => ({
                    id: c.ID,
                    codigo_novo: c.codigo_novo,
                    cliente: c.Cliente_Nome,
                    codigo_cliente: c.Código_Cliente,
                    empresa: c.empresa,
                    centro_custo: c.Centro_Custo,
                    vencimento: c.Data_Vencimento,
                    valor: parseFloat(c.Valor),
                    portador: c.Portador,
                    data_pagamento: c.Data_Pagamento,
                    observacoes: c.Observações,
                    observacoes_pagamento: c.Observacões_Pagamento
                }))
            }))
        };

        const nomeRelatorio = `auditoria_duplicacoes_${Date.now()}.json`;
        fs.writeFileSync(nomeRelatorio, JSON.stringify(relatorio, null, 2));

        console.log('═'.repeat(80));
        console.log('✅ AUDITORIA CONCLUÍDA!');
        console.log('═'.repeat(80) + '\n');
        console.log(`📄 Relatório completo salvo em: ${nomeRelatorio}\n`);

        // CONCLUSÕES
        console.log('═'.repeat(80));
        console.log('💡 CONCLUSÕES PRELIMINARES:\n');

        const percComPortador = (analise.padroes.com_portador / analise.total_contas * 100);
        if (percComPortador > 50) {
            console.log('⚠️  ALTA CORRELAÇÃO COM WEBHOOKS:');
            console.log(`   ${percComPortador.toFixed(1)}% das contas duplicadas têm payment ID (Portador)`);
            console.log('   Possível causa: Webhook do Asaas disparando múltiplas vezes\n');
        }

        if (analise.padroes.clientes_diferentes > analise.padroes.mesmo_cliente * 0.5) {
            console.log('⚠️  CLIENTES DIFERENTES NAS DUPLICATAS:');
            console.log(`   ${analise.padroes.clientes_diferentes} códigos têm clientes diferentes`);
            console.log('   Possível causa: Sistema gerando mesmo código para clientes diferentes\n');
        }

        const empresasTop = Object.entries(analise.padroes.por_empresa)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        console.log('📊 EMPRESAS MAIS AFETADAS:');
        empresasTop.forEach(([empresa, count]) => {
            console.log(`   ${empresa}: ${count} contas (${(count/analise.total_contas*100).toFixed(1)}%)`);
        });
        console.log('');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

auditoriaDuplicacoes();
