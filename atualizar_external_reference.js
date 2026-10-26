// ============================================================
// Atualizar externalReference no Asaas - V.260917270
// Busca cobranças por vencimento/valor e atualiza externalReference
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import https from 'https';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

function consultarAsaas(path, apiKey, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.asaas.com',
            port: 443,
            path: `/api/v3/${path}`,
            method: method,
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

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function atualizarExternalReference() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        // IDs das contas corrigidas que precisam atualizar externalReference
        const idsCorrigidos = [48612, 48622, 48631];

        console.log('═'.repeat(80));
        console.log('ATUALIZAÇÃO DE externalReference NO ASAAS');
        console.log('═'.repeat(80) + '\n');

        // Buscar dados das contas corrigidas
        const queryContas = `
            SELECT
                cr."ID",
                cr."Codigo",
                cr."Código_Cliente",
                c."Cliente_Nome",
                c."Cliente_ID_tab_6",
                c."Cliente_ID_tab_8",
                c."Cliente_ID_tab_9",
                cr."Data_Vencimento",
                cr."Valor",
                cr."Documento"
            FROM "Contas_Receber" cr
            LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
            WHERE cr."ID" = ANY($1::integer[])
            ORDER BY cr."ID"
        `;

        const resultContas = await client.query(queryContas, [idsCorrigidos]);

        // Buscar todos os tokens disponíveis
        const queryTokens = `
            SELECT "Codigo", "Descrição", "API_Key"
            FROM "Centros_Custos"
            WHERE "API_Key" IS NOT NULL AND "API_Key" != ''
            ORDER BY "Codigo"
        `;

        const resultTokens = await client.query(queryTokens);
        const tokens = resultTokens.rows;

        console.log(`📊 Total de empresas para buscar: ${tokens.length}\n`);

        // Para cada conta corrigida
        for (const conta of resultContas.rows) {
            console.log('═'.repeat(80));
            console.log(`ID ${conta.ID} - ${conta.Cliente_Nome}`);
            console.log('═'.repeat(80));
            console.log(`   Código NOVO: ${conta.Codigo}`);
            console.log(`   Documento (antigo): ${conta.Documento}`);
            console.log(`   Vencimento: ${conta.Data_Vencimento?.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
            console.log(`   Valor: R$ ${parseFloat(conta.Valor).toFixed(2)}\n`);

            const vencimento = conta.Data_Vencimento?.toISOString().split('T')[0];
            const valor = parseFloat(conta.Valor);

            // Tentar com cada customer_id disponível
            const customerIds = [
                { id: conta.Cliente_ID_tab_6, empresa: 'ALLMAX/SUMMER' },
                { id: conta.Cliente_ID_tab_8, empresa: 'IMOBEM' },
                { id: conta.Cliente_ID_tab_9, empresa: 'IMOBAN' }
            ].filter(c => c.id && c.id !== '');

            if (customerIds.length === 0) {
                console.log('   ❌ Cliente não tem Customer_ID em nenhuma empresa\n');
                continue;
            }

            let cobrancaEncontrada = null;
            let tokenUsado = null;

            // Buscar em TODAS as empresas
            for (const token of tokens) {
                for (const customer of customerIds) {
                    console.log(`   🔍 Buscando em ${token.Descrição} - Customer ${customer.id}...`);

                    try {
                        await delay(300); // Delay entre requisições

                        const payments = await consultarAsaas(
                            `payments?customer=${customer.id}&dueDate=${vencimento}&limit=50`,
                            token.API_Key
                        );

                        if (payments.data && payments.data.length > 0) {
                            // Procurar cobrança com valor compatível
                            const match = payments.data.find(p =>
                                Math.abs(parseFloat(p.value) - valor) < 0.01
                            );

                            if (match) {
                                console.log(`      ✅ ENCONTRADA! Payment ID: ${match.id}`);
                                console.log(`         Valor: R$ ${parseFloat(match.value).toFixed(2)}`);
                                console.log(`         Status: ${match.status}`);
                                console.log(`         externalReference atual: ${match.externalReference || 'N/A'}\n`);

                                cobrancaEncontrada = match;
                                tokenUsado = token;
                                break;
                            }
                        }

                    } catch (error) {
                        // Não encontrado nesta empresa, continuar
                    }
                }

                if (cobrancaEncontrada) break;
            }

            if (!cobrancaEncontrada) {
                console.log('   ❌ Nenhuma cobrança encontrada no Asaas com vencimento/valor compatível\n');
                continue;
            }

            // Atualizar externalReference
            console.log('   🔄 Atualizando externalReference...\n');

            try {
                const resultado = await consultarAsaas(
                    `payments/${cobrancaEncontrada.id}`,
                    tokenUsado.API_Key,
                    'PUT',
                    { externalReference: conta.Codigo.toString() }
                );

                console.log(`   ✅ ATUALIZADO COM SUCESSO!`);
                console.log(`      Payment ID: ${resultado.id}`);
                console.log(`      externalReference: ${cobrancaEncontrada.externalReference} → ${resultado.externalReference}`);
                console.log(`      Empresa: ${tokenUsado.Descrição}\n`);

            } catch (error) {
                console.log(`   ❌ Erro ao atualizar: ${error.message}\n`);
            }
        }

        console.log('═'.repeat(80));
        console.log('✅ PROCESSO CONCLUÍDO!');
        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco');
    }
}

atualizarExternalReference();
