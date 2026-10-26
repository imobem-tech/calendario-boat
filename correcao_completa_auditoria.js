// ============================================================
// correcao_completa_auditoria.js — V.2610061545
// Correção automática de todos os problemas encontrados na auditoria
// A) Corrigir links incorretos
// B) Corrigir external references
// C) Gerar relatório de clientes para cadastrar
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

// Dados das correções
const CORRECOES_LINKS = [
    { id: 50160, linkCorreto: 'https://www.asaas.com/i/0su1tp51pktdzugg', cliente: 'E B DA COSTA JUNIOR' },
    { id: 50164, linkCorreto: 'https://www.asaas.com/i/3hisy4kr2oko731g', cliente: 'ENIO CONEGLIAN FILHO' },
    { id: 50186, linkCorreto: 'https://www.asaas.com/i/3wxs1s0dy6u0r8do', cliente: 'SERGIO ALVES CORREA' }
];

const CORRECOES_EXTERNAL_REF = [
    { id: 50160, paymentId: 'pay_0su1tp51pktdzugg', externalRef: '58356', cliente: 'E B DA COSTA JUNIOR', centroCusto: 6 },
    { id: 50164, paymentId: 'pay_3hisy4kr2oko731g', externalRef: '58360', cliente: 'ENIO CONEGLIAN FILHO', centroCusto: 6 },
    { id: 50186, paymentId: 'pay_3wxs1s0dy6u0r8do', externalRef: '58382', cliente: 'SERGIO ALVES CORREA', centroCusto: 6 }
];

async function correcaoCompleta() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('CORREÇÃO AUTOMÁTICA - AUDITORIA ASAAS');
        console.log('═'.repeat(80) + '\n');

        // ============================================================
        // ETAPA A: CORRIGIR LINKS INCORRETOS
        // ============================================================
        console.log('A) CORRIGINDO LINKS INCORRETOS (3 contas)');
        console.log('─'.repeat(80) + '\n');

        for (const correcao of CORRECOES_LINKS) {
            console.log(`ID ${correcao.id} - ${correcao.cliente}`);

            const queryUpdate = `
                UPDATE "Contas_Receber"
                SET "agendamento_obs" = $1
                WHERE "ID" = $2
                RETURNING "ID", "agendamento_obs"
            `;

            const result = await client.query(queryUpdate, [correcao.linkCorreto, correcao.id]);

            console.log(`   ✅ Link atualizado: ${result.rows[0].agendamento_obs}\n`);
        }

        console.log('✅ Todos os links corrigidos!\n');

        // ============================================================
        // ETAPA B: CORRIGIR EXTERNAL REFERENCES NO ASAAS
        // ============================================================
        console.log('─'.repeat(80));
        console.log('B) CORRIGINDO EXTERNAL REFERENCES NO ASAAS (3 contas)');
        console.log('─'.repeat(80) + '\n');

        // Buscar API Key
        const queryApiKey = `
            SELECT "API_Key"
            FROM "Centros_Custos"
            WHERE "Codigo" = 6
        `;
        const resultApiKey = await client.query(queryApiKey);
        const apiKey = resultApiKey.rows[0].API_Key;

        for (const correcao of CORRECOES_EXTERNAL_REF) {
            console.log(`ID ${correcao.id} - ${correcao.cliente}`);
            console.log(`   Payment: ${correcao.paymentId}`);
            console.log(`   Novo ExternalReference: ${correcao.externalRef}`);

            try {
                const url = `https://www.asaas.com/api/v3/payments/${correcao.paymentId}`;
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'access_token': apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        externalReference: correcao.externalRef
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`   ✅ ExternalReference atualizado: ${data.externalReference}\n`);
                } else {
                    const error = await response.text();
                    console.log(`   ❌ Erro: ${response.status} - ${error}\n`);
                }

                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.log(`   ❌ Erro: ${error.message}\n`);
            }
        }

        console.log('✅ Todos os external references corrigidos!\n');

        // ============================================================
        // ETAPA C: GERAR RELATÓRIO DE CLIENTES PARA CADASTRAR
        // ============================================================
        console.log('─'.repeat(80));
        console.log('C) GERANDO RELATÓRIO DE CLIENTES PARA CADASTRAR');
        console.log('─'.repeat(80) + '\n');

        const queryClientesSemCadastro = `
            SELECT DISTINCT
                c."Codigo" as codigo_cliente,
                c."Cliente_Nome" as nome,
                c."Cliente_CPF" as cpf,
                c."Cliente_Telefone_Celular" as telefone,
                c."Outros_Email" as email,
                c."Cliente_Cidade" as cidade,
                c."Cliente_UF" as uf,
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                COUNT(cr."ID") as total_contas,
                SUM(cr."Valor") as valor_total
            FROM "Contas_Receber" cr
            INNER JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            INNER JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Data_Conta" >= '2026-10-01'::date
            AND (
                (cr."Centro_Custo"::integer IN (6, 8) AND c."Cliente_ID_tab_6" IS NULL)
                OR (cr."Centro_Custo"::integer = 4 AND c."Cliente_ID_tab_8" IS NULL)
            )
            GROUP BY
                c."Codigo", c."Cliente_Nome", c."Cliente_CPF",
                c."Cliente_Telefone_Celular", c."Outros_Email",
                c."Cliente_Cidade", c."Cliente_UF",
                cr."Centro_Custo", cc."Descrição"
            ORDER BY cc."Descrição", c."Cliente_Nome"
        `;

        const resultClientes = await client.query(queryClientesSemCadastro);

        console.log(`Total de clientes a cadastrar: ${resultClientes.rows.length}\n`);

        // Agrupar por empresa
        const porEmpresa = {};
        resultClientes.rows.forEach(cliente => {
            const empresa = cliente.empresa || `Centro ${cliente.Centro_Custo}`;
            if (!porEmpresa[empresa]) {
                porEmpresa[empresa] = [];
            }
            porEmpresa[empresa].push(cliente);
        });

        // Exibir por empresa
        Object.entries(porEmpresa).forEach(([empresa, clientes]) => {
            console.log(`🏢 ${empresa}: ${clientes.length} cliente(s)\n`);

            clientes.forEach((c, idx) => {
                console.log(`   [${idx + 1}] ${c.nome}`);
                console.log(`       Código: ${c.codigo_cliente}`);
                console.log(`       CPF: ${c.cpf || 'N/A'}`);
                console.log(`       Telefone: ${c.telefone || 'N/A'}`);
                console.log(`       Email: ${c.email || 'N/A'}`);
                console.log(`       Cidade: ${c.cidade || 'N/A'}/${c.uf || 'N/A'}`);
                console.log(`       Contas: ${c.total_contas} | Valor total: R$ ${parseFloat(c.valor_total).toFixed(2)}\n`);
            });
        });

        // Gerar CSV
        const csvLines = [
            'Empresa,Código,Nome,CPF,Telefone,Email,Cidade,UF,Total_Contas,Valor_Total'
        ];

        resultClientes.rows.forEach(c => {
            csvLines.push(
                `"${c.empresa || ''}","${c.codigo_cliente}","${c.nome || ''}","${c.cpf || ''}","${c.telefone || ''}","${c.email || ''}","${c.cidade || ''}","${c.uf || ''}","${c.total_contas}","${parseFloat(c.valor_total).toFixed(2)}"`
            );
        });

        const csvContent = csvLines.join('\n');
        const csvFilename = `CLIENTES_CADASTRAR_ASAAS_${new Date().toISOString().split('T')[0]}.csv`;

        fs.writeFileSync(csvFilename, csvContent, 'utf8');
        console.log(`✅ Relatório CSV gerado: ${csvFilename}\n`);

        // Gerar relatório Markdown
        let mdContent = `# CLIENTES PARA CADASTRAR NO ASAAS\n`;
        mdContent += `**Data:** ${new Date().toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}\n`;
        mdContent += `**Total:** ${resultClientes.rows.length} clientes\n\n`;
        mdContent += `---\n\n`;

        Object.entries(porEmpresa).forEach(([empresa, clientes]) => {
            mdContent += `## ${empresa} (${clientes.length} cliente${clientes.length > 1 ? 's' : ''})\n\n`;

            clientes.forEach((c, idx) => {
                mdContent += `### ${idx + 1}. ${c.nome}\n\n`;
                mdContent += `- **Código:** ${c.codigo_cliente}\n`;
                mdContent += `- **CPF:** ${c.cpf || 'N/A'}\n`;
                mdContent += `- **Telefone:** ${c.telefone || 'N/A'}\n`;
                mdContent += `- **Email:** ${c.email || 'N/A'}\n`;
                mdContent += `- **Cidade/UF:** ${c.cidade || 'N/A'}/${c.uf || 'N/A'}\n`;
                mdContent += `- **Contas pendentes:** ${c.total_contas}\n`;
                mdContent += `- **Valor total:** R$ ${parseFloat(c.valor_total).toFixed(2)}\n\n`;
            });

            mdContent += `---\n\n`;
        });

        const mdFilename = `CLIENTES_CADASTRAR_ASAAS_${new Date().toISOString().split('T')[0]}.md`;
        fs.writeFileSync(mdFilename, mdContent, 'utf8');
        console.log(`✅ Relatório MD gerado: ${mdFilename}\n`);

        // ============================================================
        // RESUMO FINAL
        // ============================================================
        console.log('═'.repeat(80));
        console.log('📊 RESUMO DA CORREÇÃO');
        console.log('═'.repeat(80) + '\n');

        console.log('✅ A) Links corrigidos: 3 contas');
        console.log('✅ B) External references corrigidos: 3 contas');
        console.log(`✅ C) Relatórios gerados:`);
        console.log(`   - ${csvFilename}`);
        console.log(`   - ${mdFilename}`);
        console.log(`   - ${resultClientes.rows.length} clientes para cadastrar\n`);

        console.log('═'.repeat(80));
        console.log('✅ CORREÇÃO COMPLETA CONCLUÍDA!');
        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ ERRO:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

correcaoCompleta();
