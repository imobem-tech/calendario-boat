// ============================================================
// relacao_contas_afetadas.js — V.2610061510
// Relação completa das contas afetadas com links dos boletos
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function relacionarContasAfetadas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('RELAÇÃO DE CONTAS AFETADAS PELA CORREÇÃO DE CÓDIGOS');
        console.log('═'.repeat(80) + '\n');

        // Buscar TODAS as 4 contas (duplicadas)
        const query = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Documento",
                cr."Descrição" as descricao_conta,
                cr."Código_Cliente",
                cr."Valor",
                cr."Total",
                cr."Data_Vencimento",
                cr."Data_Pagamento",
                cr."Observacões_Pagamento",
                cr."agendamento_obs",
                cr."Centro_Custo",
                c."Cliente_Nome",
                c."Cliente_CPF",
                c."Cliente_Telefone_Celular",
                cc."Descrição" as empresa
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."ID" IN (50173, 50192, 50174, 50193)
            ORDER BY cr."Codigo", cr."ID"
        `;

        const result = await client.query(query);

        console.log(`📊 Total de contas: ${result.rows.length}\n`);
        console.log('═'.repeat(80) + '\n');

        let codigoAtual = null;

        result.rows.forEach((conta, index) => {
            // Separador entre códigos diferentes
            if (conta.Codigo !== codigoAtual) {
                if (codigoAtual !== null) {
                    console.log('\n' + '═'.repeat(80) + '\n');
                }
                console.log(`🔢 CÓDIGO: ${conta.Codigo}`);
                console.log('─'.repeat(80) + '\n');
                codigoAtual = conta.Codigo;
            } else {
                console.log('─'.repeat(80) + '\n');
            }

            // Status da conta
            let status = '';
            if (conta.ID === 50173 || conta.ID === 50174) {
                status = '✅ MANTIDO (primeira ocorrência)';
            } else {
                status = '🔄 REATRIBUÍDO (segunda ocorrência)';
            }

            console.log(`[${index + 1}] ID: ${conta.ID} - ${status}`);
            console.log('');

            // Dados principais
            console.log('👤 CLIENTE:');
            console.log(`   Nome: ${conta.Cliente_Nome || 'SEM CADASTRO'}`);
            console.log(`   CPF: ${conta.Cliente_CPF || 'N/A'}`);
            console.log(`   Telefone: ${conta.Cliente_Telefone_Celular || 'N/A'}`);
            console.log('');

            console.log('📄 CONTA:');
            console.log(`   Descrição: ${conta.descricao_conta || 'N/A'}`);
            console.log(`   Empresa: ${conta.empresa || 'NÃO IDENTIFICADA'}`);
            console.log(`   Código: ${conta.Codigo}`);
            console.log(`   Documento: ${conta.Documento}`);
            console.log('');

            console.log('💰 VALORES:');
            console.log(`   Valor: R$ ${parseFloat(conta.Valor || 0).toFixed(2)}`);
            console.log(`   Total: R$ ${parseFloat(conta.Total || 0).toFixed(2)}`);
            console.log('');

            console.log('📅 DATAS:');
            const vencimento = conta.Data_Vencimento
                ? new Date(conta.Data_Vencimento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})
                : 'N/A';
            console.log(`   Vencimento: ${vencimento}`);

            if (conta.Data_Pagamento) {
                const pagamento = new Date(conta.Data_Pagamento).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'});
                console.log(`   Pagamento: ${pagamento} ✅ PAGO`);
            } else {
                console.log(`   Pagamento: ABERTO ⏳`);
            }
            console.log('');

            // Observações de pagamento
            if (conta.Observacões_Pagamento) {
                console.log('📝 OBSERVAÇÕES PAGAMENTO:');
                console.log(`   ${conta.Observacões_Pagamento}`);
                console.log('');
            }

            // Link do boleto (campo agendamento_obs)
            console.log('🔗 LINK DO BOLETO:');
            if (conta.agendamento_obs) {
                // Tentar extrair URL se houver
                const urlMatch = conta.agendamento_obs.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch) {
                    console.log(`   ${urlMatch[0]}`);
                    console.log('');
                    console.log('   📋 Campo completo (agendamento_obs):');
                    console.log(`   ${conta.agendamento_obs}`);
                } else {
                    console.log(`   ${conta.agendamento_obs}`);
                }
            } else {
                console.log(`   ⚠️ SEM LINK (campo agendamento_obs vazio)`);
            }
            console.log('');
        });

        console.log('\n═'.repeat(80));
        console.log('📊 RESUMO');
        console.log('═'.repeat(80) + '\n');

        const totalContas = result.rows.length;
        const totalPagas = result.rows.filter(r => r.Data_Pagamento).length;
        const totalAbertas = result.rows.filter(r => !r.Data_Pagamento).length;
        const totalComLink = result.rows.filter(r => r.agendamento_obs).length;
        const totalSemLink = result.rows.filter(r => !r.agendamento_obs).length;

        console.log(`Total de contas: ${totalContas}`);
        console.log(`├─ PAGAS: ${totalPagas}`);
        console.log(`└─ ABERTAS: ${totalAbertas}`);
        console.log('');
        console.log(`Links de boleto:`);
        console.log(`├─ Com link: ${totalComLink}`);
        console.log(`└─ Sem link: ${totalSemLink}`);
        console.log('');

        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

relacionarContasAfetadas();
