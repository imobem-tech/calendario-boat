// ============================================================
// Consulta ao Asaas para Verificar Pagamentos - V.260917115
// Script para consultar API Asaas e verificar quais contas
// foram realmente pagas pelos clientes
// ============================================================

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import https from 'https';

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

// Função para fazer requisições ao Asaas
function consultarAsaas(path, apiKey) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.asaas.com',
            port: 443,
            path: `/api/v3/${path}`,
            method: 'GET',
            headers: {
                'access_token': apiKey,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Erro ao parsear JSON: ${e.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Timeout na requisição'));
        });

        req.end();
    });
}

// Delay entre requisições para não sobrecarregar a API
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function verificarPagamentosAsaas() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        // Carregar relatório de duplicatas consolidado
        console.log('📂 Carregando relatório de duplicatas...\n');

        const arquivosRelatorio = fs.readdirSync('.').filter(f =>
            f.startsWith('relatorio_duplicatas_consolidado_') && f.endsWith('.json')
        ).sort().reverse();

        if (arquivosRelatorio.length === 0) {
            throw new Error('Nenhum relatório consolidado encontrado. Execute primeiro analise_duplicatas.js');
        }

        const nomeArquivo = arquivosRelatorio[0];
        const duplicatas = JSON.parse(fs.readFileSync(nomeArquivo, 'utf8'));

        console.log(`📊 Total de registros duplicados carregados: ${duplicatas.length}\n`);

        // Agrupar por código duplicado (excluindo código 0 que são registros sem código)
        const porCodigo = {};
        duplicatas
            .filter(d => d.Codigo !== 0 && d.Customer_ID_Asaas !== 'SEM CUSTOMER ID' && d.Token_Asaas !== 'SEM TOKEN')
            .forEach(item => {
                if (!porCodigo[item.Codigo]) {
                    porCodigo[item.Codigo] = [];
                }
                porCodigo[item.Codigo].push(item);
            });

        console.log(`📋 Códigos duplicados para verificar (com customer_id válido): ${Object.keys(porCodigo).length}\n`);

        // Array para armazenar resultados da verificação
        const resultadosVerificacao = [];

        // Contador de progresso
        let contador = 0;
        const total = Object.keys(porCodigo).length;

        // Para cada código duplicado, consultar o Asaas
        for (const [codigo, registros] of Object.entries(porCodigo)) {
            contador++;
            console.log(`\n[${contador}/${total}] 🔍 Verificando código ${codigo} (${registros.length} registros duplicados)...`);

            // Agrupar por empresa/token para fazer consultas separadas
            const porEmpresa = {};
            registros.forEach(r => {
                const key = `${r.Empresa}_${r.Token_Asaas}`;
                if (!porEmpresa[key]) {
                    porEmpresa[key] = {
                        empresa: r.Empresa,
                        token: r.Token_Asaas,
                        registros: []
                    };
                }
                porEmpresa[key].registros.push(r);
            });

            for (const [key, empresaData] of Object.entries(porEmpresa)) {
                console.log(`   Empresa: ${empresaData.empresa}`);

                for (const registro of empresaData.registros) {
                    console.log(`   - ID ${registro.ID}: Cliente ${registro.Nome_Cliente} (${registro.Customer_ID_Asaas})`);
                    console.log(`     Venc: ${registro.Data_Vencimento}, Valor: R$ ${registro.Valor}, Pago: ${registro.Data_Pagamento || 'NÃO PAGO'}`);

                    try {
                        // Aguardar 500ms entre requisições (limite da API Asaas é ~60 req/min)
                        await delay(500);

                        // Buscar cobranças do cliente no Asaas
                        const payments = await consultarAsaas(
                            `payments?customer=${registro.Customer_ID_Asaas}&externalReference=${codigo}`,
                            empresaData.token
                        );

                        if (payments.data && payments.data.length > 0) {
                            console.log(`     ✅ Encontradas ${payments.data.length} cobrança(s) no Asaas para este cliente:`);

                            payments.data.forEach(p => {
                                console.log(`        - Asaas ID: ${p.id}`);
                                console.log(`          Status: ${p.status}`);
                                console.log(`          Valor: R$ ${p.value}`);
                                console.log(`          Vencimento: ${p.dueDate}`);
                                console.log(`          Data Pgto: ${p.paymentDate || 'NÃO PAGO'}`);

                                // Armazenar resultado da verificação
                                resultadosVerificacao.push({
                                    Codigo_Duplicado: codigo,
                                    ID_Contas_Receber: registro.ID,
                                    Cliente_Nome: registro.Nome_Cliente,
                                    Customer_ID: registro.Customer_ID_Asaas,
                                    Empresa: empresaData.empresa,
                                    Valor_CR: registro.Valor,
                                    Vencimento_CR: registro.Data_Vencimento,
                                    Pagamento_CR: registro.Data_Pagamento,
                                    // Dados do Asaas
                                    Asaas_Payment_ID: p.id,
                                    Asaas_Status: p.status,
                                    Asaas_Valor: p.value,
                                    Asaas_Vencimento: p.dueDate,
                                    Asaas_Data_Pagamento: p.paymentDate || null,
                                    // Análise
                                    Valor_Confere: Math.abs(parseFloat(registro.Valor) - parseFloat(p.value)) < 0.01,
                                    Pagamento_Confere: (!!registro.Data_Pagamento) === (!!p.paymentDate),
                                    Status_Correto: (p.status === 'RECEIVED' && registro.Data_Pagamento) ||
                                                   (p.status !== 'RECEIVED' && !registro.Data_Pagamento)
                                });
                            });
                        } else {
                            console.log(`     ⚠️  NENHUMA cobrança encontrada no Asaas para este cliente com este código!`);

                            resultadosVerificacao.push({
                                Codigo_Duplicado: codigo,
                                ID_Contas_Receber: registro.ID,
                                Cliente_Nome: registro.Nome_Cliente,
                                Customer_ID: registro.Customer_ID_Asaas,
                                Empresa: empresaData.empresa,
                                Valor_CR: registro.Valor,
                                Vencimento_CR: registro.Data_Vencimento,
                                Pagamento_CR: registro.Data_Pagamento,
                                Asaas_Payment_ID: null,
                                Asaas_Status: 'NÃO ENCONTRADO',
                                Asaas_Valor: null,
                                Asaas_Vencimento: null,
                                Asaas_Data_Pagamento: null,
                                Valor_Confere: false,
                                Pagamento_Confere: false,
                                Status_Correto: false
                            });
                        }

                    } catch (error) {
                        console.log(`     ❌ Erro ao consultar Asaas: ${error.message}`);

                        resultadosVerificacao.push({
                            Codigo_Duplicado: codigo,
                            ID_Contas_Receber: registro.ID,
                            Cliente_Nome: registro.Nome_Cliente,
                            Customer_ID: registro.Customer_ID_Asaas,
                            Empresa: empresaData.empresa,
                            Erro: error.message
                        });
                    }
                }
            }
        }

        // Salvar resultados
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 15);

        fs.writeFileSync(
            `verificacao_asaas_${timestamp}.json`,
            JSON.stringify(resultadosVerificacao, null, 2)
        );

        // Gerar CSV
        if (resultadosVerificacao.length > 0) {
            const csvHeader = Object.keys(resultadosVerificacao[0]).join('\t') + '\n';
            const csvContent = resultadosVerificacao.map(item =>
                Object.values(item).map(v => v === null ? '' : v).join('\t')
            ).join('\n');

            fs.writeFileSync(
                `verificacao_asaas_${timestamp}.csv`,
                csvHeader + csvContent
            );
        }

        console.log(`\n\n✅ Verificação concluída!`);
        console.log(`📊 Total de registros verificados: ${resultadosVerificacao.length}`);
        console.log(`📁 Arquivos gerados:`);
        console.log(`   - verificacao_asaas_${timestamp}.json`);
        console.log(`   - verificacao_asaas_${timestamp}.csv`);

        // Estatísticas
        const comPagamento = resultadosVerificacao.filter(r => r.Asaas_Payment_ID).length;
        const semPagamento = resultadosVerificacao.filter(r => r.Asaas_Status === 'NÃO ENCONTRADO').length;
        const valorConferente = resultadosVerificacao.filter(r => r.Valor_Confere).length;
        const statusCorreto = resultadosVerificacao.filter(r => r.Status_Correto).length;

        console.log(`\n📈 ESTATÍSTICAS:`);
        console.log(`   Registros com cobrança no Asaas: ${comPagamento}`);
        console.log(`   Registros SEM cobrança no Asaas: ${semPagamento}`);
        console.log(`   Registros com valor conferente: ${valorConferente}`);
        console.log(`   Registros com status correto: ${statusCorreto}`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Desconectado do banco');
    }
}

// Executar verificação
verificarPagamentosAsaas();
