// ============================================================
// Analisar Código 56431 - V.260917240
// Metodologia: 1 → 3 → 4 → 5
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

async function analisar56431() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        const codigo = 56431;

        console.log('═'.repeat(80));
        console.log(`ANÁLISE DO CÓDIGO ${codigo}`);
        console.log('═'.repeat(80) + '\n');

        // PASSO 1: Buscar registros duplicados
        const query = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Código_Cliente",
                c."Cliente_Nome",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Total",
                cr."Data_Pagamento",
                cr."Portador",
                cr."Centro_Custo",
                cc."Descrição" as empresa,
                cc."API_Key" as token,
                c."Cliente_ID_tab_6",
                c."Cliente_ID_tab_8"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
            WHERE cr."Codigo" = $1
            ORDER BY cr."ID"
        `;

        const result = await client.query(query, [codigo]);

        console.log(`📋 REGISTROS ENCONTRADOS: ${result.rows.length}\n`);

        result.rows.forEach((r, idx) => {
            console.log(`[${idx + 1}] ID: ${r.ID}`);
            console.log(`    Cliente: [${r.Código_Cliente}] ${r.Cliente_Nome}`);
            console.log(`    Empresa: ${r.empresa} (Centro_Custo: ${r.Centro_Custo})`);
            console.log(`    Vencimento: ${r.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
            console.log(`    Valor: R$ ${parseFloat(r.Valor).toFixed(2)}`);
            console.log(`    Total: R$ ${parseFloat(r.Total).toFixed(2)}`);
            console.log(`    Pagamento: ${r.Data_Pagamento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
            console.log(`    Portador: ${r.Portador || 'N/A'}`);

            const empresaUpper = (r.empresa || '').toUpperCase();
            let customerId = '';
            if (empresaUpper.includes('SUMMER') || empresaUpper.includes('ALLMAX')) {
                customerId = r.Cliente_ID_tab_6 || '';
            } else if (empresaUpper.includes('IMOBEM')) {
                customerId = r.Cliente_ID_tab_8 || '';
            }
            console.log(`    Customer_ID: ${customerId || '❌ SEM'}\n`);
        });

        // PASSO 3: Consultar Payment no Asaas
        const portador = result.rows[0].Portador;

        if (!portador) {
            console.log('❌ Nenhum portador encontrado!\n');
            return;
        }

        console.log('─'.repeat(80));
        console.log(`🔍 PASSO 3: Consultando Payment ${portador} no Asaas...\n`);

        let paymentEncontrado = false;
        let dadosPayment = null;
        let empresaPayment = null;

        for (const r of result.rows) {
            if (!r.token) continue;

            try {
                const payment = await consultarAsaas(`payments/${portador}`, r.token);
                dadosPayment = payment;
                empresaPayment = r.empresa;
                paymentEncontrado = true;

                console.log('✅ PAYMENT ENCONTRADO!\n');
                console.log(`Payment ID: ${payment.id}`);
                console.log(`Customer ID: ${payment.customer}`);
                console.log(`Status: ${payment.status}`);
                console.log(`Valor: R$ ${parseFloat(payment.value).toFixed(2)}`);
                console.log(`Vencimento: ${payment.dueDate}`);
                console.log(`Pago em: ${payment.paymentDate || 'NÃO PAGO'}`);
                console.log(`External Ref: ${payment.externalReference || 'N/A'}`);
                console.log(`Empresa: ${empresaPayment}\n`);
                break;
            } catch (error) {
                // Não encontrado nesta empresa, tentar próxima
            }
        }

        if (!paymentEncontrado) {
            console.log('❌ Payment não encontrado em nenhuma empresa!\n');
            return;
        }

        // PASSO 4 e 5: Comparar vencimentos e customer_id
        console.log('─'.repeat(80));
        console.log('🔍 PASSO 4 e 5: Comparando vencimentos e customer_id...\n');

        result.rows.forEach((r, idx) => {
            const empresaUpper = (r.empresa || '').toUpperCase();
            let customerId = '';
            if (empresaUpper.includes('SUMMER') || empresaUpper.includes('ALLMAX')) {
                customerId = r.Cliente_ID_tab_6 || '';
            } else if (empresaUpper.includes('IMOBEM')) {
                customerId = r.Cliente_ID_tab_8 || '';
            }

            const vencimentoConta = r.Data_Vencimento?.toISOString().split('T')[0];
            const vencimentoPayment = dadosPayment.dueDate;
            const vencimentoMatch = vencimentoConta === vencimentoPayment;
            const customerMatch = customerId === dadosPayment.customer;

            console.log(`[${idx + 1}] ID: ${r.ID} - ${r.Cliente_Nome}`);
            console.log(`    Vencimento conta: ${vencimentoConta}`);
            console.log(`    Vencimento payment: ${vencimentoPayment}`);
            console.log(`    Vencimento: ${vencimentoMatch ? '✅ MATCH' : '❌ DIFERENTE'}`);
            console.log(`    Customer conta: ${customerId}`);
            console.log(`    Customer payment: ${dadosPayment.customer}`);
            console.log(`    Customer: ${customerMatch ? '✅ MATCH' : '❌ DIFERENTE'}`);

            if (vencimentoMatch && customerMatch) {
                console.log(`    🎯 ESTA É A CONTA CORRETA!\n`);
            } else {
                console.log(`    ❌ CONTA INCORRETA\n`);
            }
        });

        // CONCLUSÃO
        console.log('═'.repeat(80));
        console.log('CONCLUSÃO:');
        console.log('═'.repeat(80) + '\n');

        const corretas = result.rows.filter(r => {
            const empresaUpper = (r.empresa || '').toUpperCase();
            let customerId = '';
            if (empresaUpper.includes('SUMMER') || empresaUpper.includes('ALLMAX')) {
                customerId = r.Cliente_ID_tab_6 || '';
            } else if (empresaUpper.includes('IMOBEM')) {
                customerId = r.Cliente_ID_tab_8 || '';
            }
            const vencimentoConta = r.Data_Vencimento?.toISOString().split('T')[0];
            return vencimentoConta === dadosPayment.dueDate && customerId === dadosPayment.customer;
        });

        const incorretas = result.rows.filter(r => {
            const empresaUpper = (r.empresa || '').toUpperCase();
            let customerId = '';
            if (empresaUpper.includes('SUMMER') || empresaUpper.includes('ALLMAX')) {
                customerId = r.Cliente_ID_tab_6 || '';
            } else if (empresaUpper.includes('IMOBEM')) {
                customerId = r.Cliente_ID_tab_8 || '';
            }
            const vencimentoConta = r.Data_Vencimento?.toISOString().split('T')[0];
            return !(vencimentoConta === dadosPayment.dueDate && customerId === dadosPayment.customer);
        });

        if (corretas.length > 0) {
            console.log(`✅ CONTA(S) CORRETA(S): ${corretas.length}`);
            corretas.forEach(r => {
                console.log(`   - ID ${r.ID}: ${r.Cliente_Nome} (${r.empresa})`);
            });
            console.log();
        }

        if (incorretas.length > 0) {
            console.log(`❌ CONTA(S) INCORRETA(S): ${incorretas.length}`);
            incorretas.forEach(r => {
                console.log(`   - ID ${r.ID}: ${r.Cliente_Nome} (${r.empresa})`);
            });
            console.log();
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

analisar56431();
