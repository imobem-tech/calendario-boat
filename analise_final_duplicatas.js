// ============================================================
// Análise Final de Duplicatas - V.260917120
// Consolida todos os dados e gera relatório executivo
// ============================================================

import fs from 'fs';

async function gerarRelatorioExecutivo() {
    try {
        console.log('📊 ANÁLISE FINAL DE DUPLICATAS - CONTAS A RECEBER\n');
        console.log('='.repeat(70) + '\n');

        // Carregar relatório consolidado
        const arquivosConsolidado = fs.readdirSync('.').filter(f =>
            f.startsWith('relatorio_duplicatas_consolidado_') && f.endsWith('.json')
        ).sort().reverse();

        const duplicatas = JSON.parse(fs.readFileSync(arquivosConsolidado[0], 'utf8'));

        // Carregar verificação Asaas
        const arquivosVerificacao = fs.readdirSync('.').filter(f =>
            f.startsWith('verificacao_asaas_') && f.endsWith('.json')
        ).sort().reverse();

        const verificacaoAsaas = arquivosVerificacao.length > 0
            ? JSON.parse(fs.readFileSync(arquivosVerificacao[0], 'utf8'))
            : [];

        // ANÁLISE 1: Registros por situação
        console.log('1️⃣ CLASSIFICAÇÃO DOS REGISTROS DUPLICADOS:\n');

        const semCodigo = duplicatas.filter(d => d.Codigo === 0);
        const comCodigo = duplicatas.filter(d => d.Codigo !== 0);
        const semCustomerID = comCodigo.filter(d => d.Customer_ID_Asaas === 'SEM CUSTOMER ID');
        const comCustomerID = comCodigo.filter(d => d.Customer_ID_Asaas !== 'SEM CUSTOMER ID');
        const verificados = verificacaoAsaas.length;
        const naoEncontradosAsaas = verificacaoAsaas.filter(v => v.Asaas_Status === 'NÃO ENCONTRADO').length;

        console.log(`   Total de registros duplicados: ${duplicatas.length}`);
        console.log(`   ├─ Código = 0 (sem código): ${semCodigo.length}`);
        console.log(`   └─ Com código válido: ${comCodigo.length}`);
        console.log(`      ├─ SEM Customer_ID Asaas: ${semCustomerID.length} ⚠️  BAIXAS INCORRETAS`);
        console.log(`      └─ COM Customer_ID Asaas: ${comCustomerID.length}`);
        console.log(`         ├─ Verificados no Asaas: ${verificados}`);
        console.log(`         │  └─ NÃO encontrados: ${naoEncontradosAsaas} ⚠️  BAIXAS INCORRETAS`);
        console.log(`         └─ Não verificados: ${comCustomerID.length - verificados}\n`);

        // ANÁLISE 2: Status de pagamento
        console.log('2️⃣ STATUS DE PAGAMENTO:\n');

        const jaBaixados = duplicatas.filter(d => d.Data_Pagamento && d.Data_Pagamento !== '');
        const pendentes = duplicatas.filter(d => !d.Data_Pagamento || d.Data_Pagamento === '');

        console.log(`   Registros com Data_Pagamento: ${jaBaixados.length}`);
        console.log(`   Registros pendentes (sem Data_Pagamento): ${pendentes.length}\n`);

        // ANÁLISE 3: Baixas suspeitas/incorretas
        console.log('3️⃣ BAIXAS SUSPEITAS/INCORRETAS IDENTIFICADAS:\n');

        const baixasIncorretas = [];

        // Categoria A: Baixados mas sem Customer_ID
        const baixadosSemCustomer = jaBaixados.filter(d =>
            d.Customer_ID_Asaas === 'SEM CUSTOMER ID' && d.Codigo !== 0
        );
        baixasIncorretas.push(...baixadosSemCustomer.map(d => ({
            ...d,
            Categoria_Problema: 'A - Baixado mas sem Customer_ID',
            Gravidade: 'ALTA',
            Motivo: 'Cliente não tem cadastro no Asaas, logo não pode ter pagado via Asaas'
        })));

        // Categoria B: Verificados no Asaas e não encontrados
        verificacaoAsaas
            .filter(v => v.Asaas_Status === 'NÃO ENCONTRADO')
            .forEach(v => {
                const registro = duplicatas.find(d => d.ID === v.ID_Contas_Receber);
                if (registro) {
                    baixasIncorretas.push({
                        ...registro,
                        Categoria_Problema: 'B - Verificado no Asaas e não encontrado',
                        Gravidade: 'CRÍTICA',
                        Motivo: 'Consultado no Asaas e cobrança com este código não existe para este cliente'
                    });
                }
            });

        // Categoria C: Código 0 mas com data de pagamento
        const codigo0Baixados = semCodigo.filter(d => d.Data_Pagamento && d.Data_Pagamento !== '');
        baixasIncorretas.push(...codigo0Baixados.map(d => ({
            ...d,
            Categoria_Problema: 'C - Código 0 mas baixado',
            Gravidade: 'MÉDIA',
            Motivo: 'Código 0 indica falta de vínculo com Asaas, baixa pode ser manual ou erro'
        })));

        console.log(`   TOTAL DE BAIXAS INCORRETAS IDENTIFICADAS: ${baixasIncorretas.length}\n`);
        console.log(`   Por categoria:`);
        console.log(`   ├─ Categoria A (sem Customer_ID): ${baixadosSemCustomer.length}`);
        console.log(`   ├─ Categoria B (verificado e não encontrado): ${naoEncontradosAsaas}`);
        console.log(`   └─ Categoria C (código 0 baixado): ${codigo0Baixados.length}\n`);

        // ANÁLISE 4: Códigos mais problemáticos
        console.log('4️⃣ CÓDIGOS MAIS DUPLICADOS (Top 10, excluindo código 0):\n');

        const porCodigo = {};
        comCodigo.forEach(d => {
            if (!porCodigo[d.Codigo]) {
                porCodigo[d.Codigo] = {
                    codigo: d.Codigo,
                    quantidade: 0,
                    clientes: new Set(),
                    empresas: new Set(),
                    valores: new Set(),
                    baixados: 0
                };
            }
            porCodigo[d.Codigo].quantidade++;
            porCodigo[d.Codigo].clientes.add(d.Nome_Cliente);
            porCodigo[d.Codigo].empresas.add(d.Empresa);
            porCodigo[d.Codigo].valores.add(parseFloat(d.Valor || 0));
            if (d.Data_Pagamento) porCodigo[d.Codigo].baixados++;
        });

        const topCodigos = Object.values(porCodigo)
            .map(c => ({
                ...c,
                clientes: Array.from(c.clientes),
                empresas: Array.from(c.empresas),
                valores: Array.from(c.valores)
            }))
            .sort((a, b) => b.quantidade - a.quantidade)
            .slice(0, 10);

        topCodigos.forEach((c, idx) => {
            console.log(`   ${idx + 1}. Código ${c.codigo}:`);
            console.log(`      Registros: ${c.quantidade} | Baixados: ${c.baixados}`);
            console.log(`      Clientes diferentes: ${c.clientes.length}`);
            console.log(`      Empresas: ${c.empresas.join(', ')}`);
            console.log(`      Valores: R$ ${c.valores.join(', R$ ')}\n`);
        });

        // ANÁLISE 5: Impacto financeiro estimado
        console.log('5️⃣ IMPACTO FINANCEIRO ESTIMADO:\n');

        const valorTotalBaixasIncorretas = baixasIncorretas.reduce((sum, b) =>
            sum + parseFloat(b.Valor || 0), 0
        );

        const valorCategA = baixasIncorretas
            .filter(b => b.Categoria_Problema.startsWith('A'))
            .reduce((sum, b) => sum + parseFloat(b.Valor || 0), 0);

        const valorCategB = baixasIncorretas
            .filter(b => b.Categoria_Problema.startsWith('B'))
            .reduce((sum, b) => sum + parseFloat(b.Valor || 0), 0);

        const valorCategC = baixasIncorretas
            .filter(b => b.Categoria_Problema.startsWith('C'))
            .reduce((sum, b) => sum + parseFloat(b.Valor || 0), 0);

        console.log(`   Valor total das baixas incorretas: R$ ${valorTotalBaixasIncorretas.toFixed(2)}`);
        console.log(`   ├─ Categoria A: R$ ${valorCategA.toFixed(2)}`);
        console.log(`   ├─ Categoria B: R$ ${valorCategB.toFixed(2)}`);
        console.log(`   └─ Categoria C: R$ ${valorCategC.toFixed(2)}\n`);

        // SALVAR RELATÓRIOS
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 15);

        // Relatório de baixas incorretas
        fs.writeFileSync(
            `baixas_incorretas_${timestamp}.json`,
            JSON.stringify(baixasIncorretas, null, 2)
        );

        // CSV para Excel
        if (baixasIncorretas.length > 0) {
            const csvHeader = 'ID\tCodigo\tDocumento\tData_Vencimento\tValor\tData_Pagamento\t' +
                            'Codigo_Cliente\tNome_Cliente\tEmpresa\tCustomer_ID_Asaas\t' +
                            'Categoria_Problema\tGravidade\tMotivo\n';
            const csvContent = baixasIncorretas.map(b =>
                `${b.ID}\t${b.Codigo}\t${b.Documento}\t${b.Data_Vencimento}\t${b.Valor}\t${b.Data_Pagamento}\t` +
                `${b.Codigo_Cliente}\t${b.Nome_Cliente}\t${b.Empresa}\t${b.Customer_ID_Asaas}\t` +
                `${b.Categoria_Problema}\t${b.Gravidade}\t${b.Motivo}`
            ).join('\n');

            fs.writeFileSync(
                `baixas_incorretas_${timestamp}.csv`,
                csvHeader + csvContent
            );
        }

        // Relatório executivo em texto
        const relatorioTexto = `
RELATÓRIO EXECUTIVO - ANÁLISE DE DUPLICATAS EM CONTAS_RECEBER
================================================================
Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

RESUMO EXECUTIVO:
-----------------
Total de registros duplicados: ${duplicatas.length}
Baixas incorretas identificadas: ${baixasIncorretas.length}
Impacto financeiro estimado: R$ ${valorTotalBaixasIncorretas.toFixed(2)}

PROBLEMA PRINCIPAL:
-------------------
O webhook do Asaas retorna o externalReference (campo Codigo) e o sistema
baixa TODAS as contas com aquele código, independente do cliente.

Isso gera dois problemas:
1. Contas de clientes que NÃO pagaram aparecem como PAGAS
2. Contas de clientes que PAGARAM podem não estar registradas

CATEGORIAS DE PROBLEMAS:
-------------------------
A) Baixado mas sem Customer_ID: ${baixadosSemCustomer.length} registros (R$ ${valorCategA.toFixed(2)})
   - Cliente não tem cadastro no Asaas
   - Impossível ter recebido via webhook Asaas
   - AÇÃO: Limpar Data_Pagamento e Observacoes_Pagamento

B) Verificado no Asaas e não encontrado: ${naoEncontradosAsaas} registros (R$ ${valorCategB.toFixed(2)})
   - Consultado na API do Asaas
   - Cobrança com este código NÃO existe para este cliente
   - AÇÃO: Limpar Data_Pagamento e Observacoes_Pagamento

C) Código 0 mas baixado: ${codigo0Baixados.length} registros (R$ ${valorCategC.toFixed(2)})
   - Código 0 indica falta de vínculo com Asaas
   - Podem ser baixas manuais legítimas ou erros
   - AÇÃO: Revisar manualmente caso a caso

PRÓXIMOS PASSOS RECOMENDADOS:
-------------------------------
1. URGENTE: Corrigir as categorias A e B (alta confiança de erro)
2. Revisar categoria C manualmente
3. Resolver duplicação de códigos para evitar novos casos
4. Implementar validação no webhook para não baixar múltiplas contas

ARQUIVOS GERADOS:
-----------------
- baixas_incorretas_${timestamp}.json (detalhes completos)
- baixas_incorretas_${timestamp}.csv (para análise em Excel)
- Este relatório: relatorio_executivo_${timestamp}.txt
`;

        fs.writeFileSync(
            `relatorio_executivo_${timestamp}.txt`,
            relatorioTexto
        );

        console.log('='.repeat(70));
        console.log('\n✅ ANÁLISE FINALIZADA!\n');
        console.log('📁 Arquivos gerados:');
        console.log(`   - baixas_incorretas_${timestamp}.json`);
        console.log(`   - baixas_incorretas_${timestamp}.csv`);
        console.log(`   - relatorio_executivo_${timestamp}.txt\n`);

        console.log('📊 RESUMO:');
        console.log(`   Total de duplicatas: ${duplicatas.length}`);
        console.log(`   Baixas incorretas: ${baixasIncorretas.length}`);
        console.log(`   Impacto financeiro: R$ ${valorTotalBaixasIncorretas.toFixed(2)}\n`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }
}

gerarRelatorioExecutivo();
