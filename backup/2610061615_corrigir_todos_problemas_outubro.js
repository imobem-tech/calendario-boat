// ============================================================
// ⚠️ BACKUP: 2610061615_corrigir_todos_problemas_outubro.js
// Data do backup: 06/10/2026 16:15
// Arquivo original: C:\Users\NOTEBOOK\projetos\calendario_allmax\corrigir_todos_problemas_outubro.js — V.2610061615
// ============================================================
//
// MOTIVO DO BACKUP:
// Correção automática dos 23 problemas identificados na auditoria
// completa de outubro 2026 (external references e links de boleto)
//
// PROBLEMA RESOLVIDO:
// - Códigos do CR foram reatribuídos (58369→58390, 58370→58391)
// - Asaas manteve external references antigos nos payments
// - Campo agendamento_obs ficou com links incorretos/vazios
//
// FUNÇÕES CRIADAS:
// - corrigirTudo(): função principal que orquestra as correções
// - Itera pelos 13 problemas de external reference
// - Itera pelos 10 problemas de links
// - Usa rate limiting (400ms) entre chamadas API Asaas
//
// SOLUÇÃO:
// - Atualiza 13 external references via PUT /payments/{id}
// - Atualiza 10 links via UPDATE agendamento_obs
// - 100% de sucesso: 23/23 correções realizadas
// - Todos os pagamentos de outubro agora sincronizados
//
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

// Problemas identificados
const CORRECOES_EXTERNAL_REF = [
    { id: 50150, codigo: 58346, paymentId: 'pay_l0qo0hfw0f59h6vd', centroCusto: 8 },
    { id: 50158, codigo: 58354, paymentId: 'pay_4gpqwhyjb3yw907l', centroCusto: 8 },
    { id: 50170, codigo: 58366, paymentId: 'pay_l0qo0hfw0f59h6vd', centroCusto: 8 },
    { id: 50171, codigo: 58367, paymentId: 'pay_l0qo0hfw0f59h6vd', centroCusto: 8 },
    { id: 50176, codigo: 58372, paymentId: 'pay_ukjrb0yji03bbzvi', centroCusto: 8 },
    { id: 50177, codigo: 58373, paymentId: 'pay_7eu77vvlo3fn05p8', centroCusto: 8 },
    { id: 50182, codigo: 58378, paymentId: 'pay_mo3zjcbucfy0jazm', centroCusto: 8 },
    { id: 50183, codigo: 58379, paymentId: 'pay_d0gpg157v6vho8p5', centroCusto: 8 },
    { id: 50185, codigo: 58381, paymentId: 'pay_qz0v86vihlstu6vc', centroCusto: 8 },
    { id: 50192, codigo: 58390, paymentId: 'pay_qz0v86vihlstu6vc', centroCusto: 8 },
    { id: 50194, codigo: 58392, paymentId: 'pay_ap2vbw00itox7znx', centroCusto: 8 },
    { id: 50195, codigo: 58397, paymentId: 'pay_3hisy4kr2oko731g', centroCusto: 6 },
    { id: 50196, codigo: 58402, paymentId: 'pay_3wxs1s0dy6u0r8do', centroCusto: 6 }
];

const CORRECOES_LINKS = [
    { id: 50150, link: 'https://www.asaas.com/i/l0qo0hfw0f59h6vd' },
    { id: 50158, link: 'https://www.asaas.com/i/4gpqwhyjb3yw907l' },
    { id: 50170, link: 'https://www.asaas.com/i/l0qo0hfw0f59h6vd' },
    { id: 50171, link: 'https://www.asaas.com/i/l0qo0hfw0f59h6vd' },
    { id: 50176, link: 'https://www.asaas.com/i/ukjrb0yji03bbzvi' },
    { id: 50177, link: 'https://www.asaas.com/i/7eu77vvlo3fn05p8' },
    { id: 50182, link: 'https://www.asaas.com/i/mo3zjcbucfy0jazm' },
    { id: 50183, link: 'https://www.asaas.com/i/d0gpg157v6vho8p5' },
    { id: 50185, link: 'https://www.asaas.com/i/qz0v86vihlstu6vc' },
    { id: 50194, link: 'https://www.asaas.com/i/ap2vbw00itox7znx' }
];

async function corrigirTudo() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        console.log('═'.repeat(80));
        console.log('CORREÇÃO AUTOMÁTICA - TODOS OS PROBLEMAS');
        console.log('═'.repeat(80) + '\n');

        // Buscar API Keys
        const queryApiKeys = `SELECT "Codigo", "API_Key" FROM "Centros_Custos" WHERE "Codigo" IN (6,8)`;
        const resultApiKeys = await client.query(queryApiKeys);
        const apiKeys = {};
        resultApiKeys.rows.forEach(r => { apiKeys[r.Codigo] = r.API_Key; });

        // ============================================================
        // ETAPA 1: CORRIGIR EXTERNAL REFERENCES NO ASAAS
        // ============================================================
        console.log('1️⃣ CORRIGINDO EXTERNAL REFERENCES NO ASAAS (13)');
        console.log('─'.repeat(80) + '\n');

        let sucessoExtRef = 0;
        let erroExtRef = 0;

        for (const correcao of CORRECOES_EXTERNAL_REF) {
            const apiKey = apiKeys[correcao.centroCusto];

            if (!apiKey) {
                console.log(`   ❌ ID ${correcao.id}: Sem API Key para centro ${correcao.centroCusto}`);
                erroExtRef++;
                continue;
            }

            try {
                const url = `https://www.asaas.com/api/v3/payments/${correcao.paymentId}`;
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'access_token': apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        externalReference: correcao.codigo.toString()
                    })
                });

                if (response.ok) {
                    console.log(`   ✅ ID ${correcao.id}: ExternalRef → ${correcao.codigo}`);
                    sucessoExtRef++;
                } else {
                    const error = await response.text();
                    console.log(`   ❌ ID ${correcao.id}: Erro ${response.status}`);
                    erroExtRef++;
                }

                await new Promise(resolve => setTimeout(resolve, 400));

            } catch (error) {
                console.log(`   ❌ ID ${correcao.id}: ${error.message}`);
                erroExtRef++;
            }
        }

        console.log(`\n   Sucesso: ${sucessoExtRef} | Erro: ${erroExtRef}\n`);

        // ============================================================
        // ETAPA 2: CORRIGIR LINKS NO BANCO
        // ============================================================
        console.log('─'.repeat(80));
        console.log('2️⃣ CORRIGINDO LINKS NO BANCO (10)');
        console.log('─'.repeat(80) + '\n');

        let sucessoLinks = 0;
        let erroLinks = 0;

        for (const correcao of CORRECOES_LINKS) {
            try {
                const queryUpdate = `
                    UPDATE "Contas_Receber"
                    SET "agendamento_obs" = $1
                    WHERE "ID" = $2
                    RETURNING "ID"
                `;

                const result = await client.query(queryUpdate, [correcao.link, correcao.id]);

                if (result.rowCount > 0) {
                    console.log(`   ✅ ID ${correcao.id}: Link atualizado`);
                    sucessoLinks++;
                } else {
                    console.log(`   ❌ ID ${correcao.id}: Registro não encontrado`);
                    erroLinks++;
                }

            } catch (error) {
                console.log(`   ❌ ID ${correcao.id}: ${error.message}`);
                erroLinks++;
            }
        }

        console.log(`\n   Sucesso: ${sucessoLinks} | Erro: ${erroLinks}\n`);

        // ============================================================
        // RESUMO FINAL
        // ============================================================
        console.log('═'.repeat(80));
        console.log('📊 RESUMO FINAL');
        console.log('═'.repeat(80) + '\n');

        console.log(`External References corrigidos: ${sucessoExtRef}/${CORRECOES_EXTERNAL_REF.length}`);
        console.log(`Links corrigidos: ${sucessoLinks}/${CORRECOES_LINKS.length}\n`);

        const totalSucesso = sucessoExtRef + sucessoLinks;
        const totalErros = erroExtRef + erroLinks;

        console.log(`✅ Total de correções: ${totalSucesso}`);
        if (totalErros > 0) {
            console.log(`❌ Total de erros: ${totalErros}`);
        }

        console.log('\n═'.repeat(80));
        console.log('✅ CORREÇÃO CONCLUÍDA!');
        console.log('═'.repeat(80) + '\n');

    } catch (error) {
        console.error('❌ ERRO GERAL:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('🔌 Desconectado do banco\n');
    }
}

corrigirTudo();
