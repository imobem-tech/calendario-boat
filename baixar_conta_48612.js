// ============================================================
// Baixar Conta ID 48612 Corretamente - V.260917280
// Busca dados do payment no Asaas e baixa usando ID direto
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import https from 'https';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

function consultarAsaas(path, apiKey) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.asaas.com',
            port: 443,
            path: `/api/v3/${path}`,
            method: 'GET',
            headers: {
                'access_token': apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'CalendarioAllmax/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}: ${parsed.errors?.[0]?.description || data}`));
                    } else {
                        resolve(parsed);
                    }
                }
                catch (e) { reject(new Error(`Erro ao parsear JSON: ${e.message}`)); }
            });
        });

        req.on('error', (error) => reject(error));
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        req.end();
    });
}

async function baixarConta48612() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        const idConta = 48612;
        const paymentId = 'pay_xwk0dlm8bfhy7bqn';

        console.log('═'.repeat(80));
        console.log(`BAIXA CORRETA DA CONTA ID ${idConta}`);
        console.log('═'.repeat(80) + '\n');

        // Buscar token da empresa SUMMER (onde está o payment)
        const queryToken = `
            SELECT "API_Key" FROM "Centros_Custos" WHERE "Codigo" = 6
        `;
        const resultToken = await client.query(queryToken);
        const token = resultToken.rows[0].API_Key;

        // Buscar dados da conta atual
        console.log('📋 DADOS ATUAIS DA CONTA:\n');
        const queryConta = `
            SELECT
                "ID", "Codigo", "Valor", "Total",
                "Data_Vencimento", "Data_Pagamento", "Portador"
            FROM "Contas_Receber"
            WHERE "ID" = $1
        `;
        const resultConta = await client.query(queryConta, [idConta]);
        const conta = resultConta.rows[0];

        console.log(`   ID: ${conta.ID}`);
        console.log(`   Codigo: ${conta.Codigo}`);
        console.log(`   Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}`);
        console.log(`   Total: R$ ${parseFloat(conta.Total).toFixed(2)}`);
        console.log(`   Data_Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
        console.log(`   Data_Pagamento: ${conta.Data_Pagamento || 'NULL'}`);
        console.log(`   Portador: ${conta.Portador || 'N/A'}\n`);

        // Buscar dados do payment no Asaas
        console.log('🔍 Consultando payment no Asaas...\n');
        const payment = await consultarAsaas(`payments/${paymentId}`, token);

        console.log('💳 DADOS DO PAYMENT NO ASAAS:\n');
        console.log(`   Payment ID: ${payment.id}`);
        console.log(`   Customer: ${payment.customer}`);
        console.log(`   Status: ${payment.status}`);
        console.log(`   Valor: R$ ${parseFloat(payment.value).toFixed(2)}`);
        console.log(`   Vencimento: ${payment.dueDate}`);
        console.log(`   Pago em: ${payment.paymentDate || 'NÃO PAGO'}`);
        console.log(`   Confirmado em: ${payment.confirmedDate || 'N/A'}`);
        console.log(`   externalReference: ${payment.externalReference}`);
        console.log(`   Forma: ${payment.billingType}\n`);

        if (payment.status !== 'RECEIVED' && !payment.paymentDate) {
            console.log('⚠️  Payment ainda não foi recebido no Asaas!\n');
            console.log('Deseja baixar mesmo assim? Cancelando por segurança...\n');
            return;
        }

        // Preparar dados da baixa
        const dataPagamento = payment.paymentDate || payment.confirmedDate;
        const valorRecebido = parseFloat(payment.value);
        const observacao = `Asaas_${payment.paymentDate}_payment_${payment.id}_atualizado`;

        console.log('─'.repeat(80));
        console.log('🔄 EXECUTANDO BAIXA...\n');

        // IMPORTANTE: Baixar usando ID direto, NUNCA por externalReference!
        const queryBaixa = `
            UPDATE "Contas_Receber"
            SET
                "Data_Pagamento" = $2,
                "Total" = $3,
                "Portador" = $4,
                "Observacões_Pagamento" = $5
            WHERE "ID" = $1
        `;

        await client.query(queryBaixa, [
            idConta,
            dataPagamento,
            valorRecebido,
            payment.id,
            observacao
        ]);

        // Verificar resultado
        const queryVerificar = `
            SELECT
                "ID", "Codigo", "Total", "Data_Pagamento",
                "Portador", "Observacões_Pagamento"
            FROM "Contas_Receber"
            WHERE "ID" = $1
        `;
        const resultVerificar = await client.query(queryVerificar, [idConta]);
        const verificado = resultVerificar.rows[0];

        console.log('✅ BAIXA EXECUTADA COM SUCESSO!\n');
        console.log('📋 DADOS APÓS BAIXA:\n');
        console.log(`   ID: ${verificado.ID} ← REFERÊNCIA ÚNICA USADA`);
        console.log(`   Codigo: ${verificado.Codigo}`);
        console.log(`   Total: R$ ${parseFloat(verificado.Total).toFixed(2)} ✅`);
        console.log(`   Data_Pagamento: ${verificado.Data_Pagamento} ✅`);
        console.log(`   Portador: ${verificado.Portador} ✅`);
        console.log(`   Observações: ${verificado.Observacões_Pagamento}\n`);

        console.log('═'.repeat(80));
        console.log('✅ CONTA ID 48612 BAIXADA CORRETAMENTE!');
        console.log('═'.repeat(80) + '\n');

        console.log('🎯 PROCESSO COMPLETO:');
        console.log('   1. ✅ Corrigido conta incorreta');
        console.log('   2. ✅ Reatribuído código (57773)');
        console.log('   3. ✅ Atualizado externalReference no Asaas');
        console.log('   4. ✅ Baixado conta correta usando ID direto\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

baixarConta48612();
