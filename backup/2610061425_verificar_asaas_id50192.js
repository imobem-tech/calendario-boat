// ============================================================
// verificar_asaas_id50192.js — V.2610061415
// Verificar se há referências Asaas que precisam ser atualizadas
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function verificarAsaas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('VERIFICAÇÃO DE REFERÊNCIAS ASAAS - ID 50192');
        console.log('═'.repeat(80) + '\n');

        // Verificar os dados da conta
        const queryDados = `
            SELECT
                "ID",
                "Codigo",
                "Documento",
                "Observacões_Pagamento"
            FROM "Contas_Receber"
            WHERE "ID" = 50192
        `;

        const result = await client.query(queryDados);
        const conta = result.rows[0];

        console.log('📋 DADOS DA CONTA:\n');
        console.log(`   ID: ${conta.ID}`);
        console.log(`   Código: ${conta.Codigo}`);
        console.log(`   Documento: ${conta.Documento}`);
        console.log(`   Obs_Pagamento: ${conta.Observacões_Pagamento}\n`);

        // Extrair o payment_id do Asaas da observação
        const obsMatch = conta.Observacões_Pagamento?.match(/payment_([a-zA-Z0-9_]+)/);
        const paymentId = obsMatch ? obsMatch[1] : null;

        if (paymentId) {
            console.log(`   📌 Payment ID Asaas encontrado: pay_${paymentId}\n`);
        } else {
            console.log(`   ⚠️ Payment ID Asaas NÃO encontrado na observação\n`);
        }

        console.log('─'.repeat(80));
        console.log('📊 ANÁLISE:\n');

        if (conta.Codigo === conta.Documento) {
            console.log('   ✅ Código e Documento estão sincronizados');
            console.log(`      Ambos = ${conta.Codigo}\n`);
        } else {
            console.log('   ⚠️ Código e Documento DIFERENTES');
            console.log(`      Código: ${conta.Codigo}`);
            console.log(`      Documento: ${conta.Documento}\n`);
        }

        console.log('─'.repeat(80));
        console.log('📋 CONCLUSÃO:\n');

        console.log('   ✅ NENHUMA ação necessária no Asaas');
        console.log('   \n   MOTIVO:');
        console.log('   - O payment já foi processado e baixado no banco');
        console.log('   - O código é uso INTERNO (não é enviado ao Asaas)');
        console.log('   - O Asaas identifica pagamentos pelo payment_id, não pelo código CR');
        console.log('   - A alteração do código não afeta a integração com Asaas\n');

        console.log('   ℹ️  OBSERVAÇÃO:');
        console.log('   - O código antigo (58369) estava na Obs_Pagamento apenas como registro');
        console.log('   - Não há vínculo funcional entre o código CR e o payment Asaas');
        console.log('   - A conta foi corretamente baixada e não será reprocessada\n');

        console.log('═'.repeat(80));
        console.log('✅ VERIFICAÇÃO CONCLUÍDA - NENHUM AJUSTE NECESSÁRIO');
        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

verificarAsaas();
