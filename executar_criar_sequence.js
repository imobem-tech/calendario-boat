// ============================================================
// Executar criação de SEQUENCE e FUNCTION - V.2609180020
// ============================================================

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function executarSQL() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco Neon\n');

        // 1. Criar SEQUENCE
        console.log('[1/3] Criando SEQUENCE...');
        await client.query(`
            CREATE SEQUENCE IF NOT EXISTS contas_receber_codigo_seq
            START WITH 58271
            INCREMENT BY 1
            NO CYCLE
        `);
        console.log('✅ SEQUENCE criada\n');

        // 2. Criar FUNCTION
        console.log('[2/3] Criando FUNCTION...');
        await client.query(`
            CREATE OR REPLACE FUNCTION gerar_proximo_codigo_cr()
            RETURNS INTEGER AS $$
            BEGIN
                RETURN nextval('contas_receber_codigo_seq');
            END;
            $$ LANGUAGE plpgsql
        `);
        console.log('✅ FUNCTION criada\n');

        // 3. Testar
        console.log('[3/3] Testando FUNCTION...');
        const result = await client.query('SELECT gerar_proximo_codigo_cr() as teste_codigo');
        console.log('✅ Teste bem-sucedido!');
        console.log('   Código gerado:', result.rows[0].teste_codigo);

        console.log('\n' + '═'.repeat(60));
        console.log('✅ SEQUENCE E FUNCTION CRIADAS COM SUCESSO!');
        console.log('═'.repeat(60));
        console.log('PRÓXIMOS PASSOS:');
        console.log('1. ✅ Banco atualizado');
        console.log('2. ⏳ Alterar wpp/asaas.js');
        console.log('3. ⏳ Alterar VBA no Access');
        console.log('═'.repeat(60));

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Desconectado do banco');
    }
}

executarSQL();
