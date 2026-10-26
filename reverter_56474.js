import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

await client.connect();

console.log('Revertendo IDs 48667 e 48668 para código 56474...\n');

await client.query('UPDATE "Contas_Receber" SET "Codigo" = 56474 WHERE "ID" IN (48667, 48668)');

console.log('✅ Código revertido!\n');

const result = await client.query('SELECT "ID", "Codigo" FROM "Contas_Receber" WHERE "ID" IN (48667, 48668)');
console.log('Verificação:');
console.table(result.rows);

await client.end();
