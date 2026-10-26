// Verificar estrutura das tabelas - V.260917113
import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function verificar() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado\n');

        // Estrutura Centros_Custos
        console.log('📋 Estrutura da tabela Centros_Custos:\n');
        let query = `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'Centros_Custos'
            ORDER BY ordinal_position
        `;
        let result = await client.query(query);
        result.rows.forEach(col => {
            console.log(`   ${col.column_name} (${col.data_type})`);
        });

        // Estrutura Cliente
        console.log('\n\n📋 Estrutura da tabela Cliente:\n');
        query = `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'Cliente'
            ORDER BY ordinal_position
        `;
        result = await client.query(query);
        result.rows.forEach(col => {
            console.log(`   ${col.column_name} (${col.data_type})`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await client.end();
    }
}

verificar();
