import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

await client.connect();
const result = await client.query(`
    SELECT
        cr."ID",
        cr."Centro_Custo",
        cc."Codigo" as centro_codigo,
        cc."Descrição" as centro_desc,
        SUBSTRING(cc."API_Key", 1, 20) as token_preview
    FROM "Contas_Receber" cr
    LEFT JOIN "Centros_Custos" cc ON cr."Centro_Custo"::integer = cc."Codigo"
    WHERE cr."ID" = 48654
`);
console.log('ID 48654:');
console.log(result.rows[0]);
await client.end();
