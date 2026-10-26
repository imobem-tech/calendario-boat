// Listar tabelas do banco - V.260917112
import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';

async function listar() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('✅ Conectado\n');

        const query = `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `;

        const result = await client.query(query);
        console.log('📋 Tabelas no banco:\n');
        result.rows.forEach((row, idx) => {
            console.log(`${idx + 1}. ${row.table_name}`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await client.end();
    }
}

listar();
