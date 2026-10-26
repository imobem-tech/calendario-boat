import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

await client.connect();
const result = await client.query('SELECT "Codigo", "Descrição" FROM "Centros_Custos" ORDER BY "Codigo"');
console.table(result.rows);
await client.end();
