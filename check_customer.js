import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

await client.connect();

const result = await client.query(`
    SELECT
        cr."ID",
        c."Cliente_Nome",
        c."Cliente_ID_tab_6",
        c."Cliente_ID_tab_8",
        c."Cliente_ID_tab_9"
    FROM "Contas_Receber" cr
    LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
    WHERE cr."ID" = 48654
`);

console.log('Customer IDs do cliente:');
console.log(result.rows[0]);

await client.end();
