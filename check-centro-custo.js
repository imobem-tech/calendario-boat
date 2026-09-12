import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('📊 Consultando tabela Centros_Custos:\n');

// 1. Ver estrutura da tabela
const schema = await pool.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'Centros_Custos'
  ORDER BY ordinal_position
`);

console.log('📋 Estrutura da tabela:\n');
schema.rows.forEach(r => {
  console.log(`  ${r.column_name} (${r.data_type})`);
});

console.log('\n\n');

// 2. Ver todos os centros de custo
const centros = await pool.query(`
  SELECT *
  FROM "Centros_Custos"
  ORDER BY "Codigo"
`);

console.log(`💰 Total de Centros de Custo: ${centros.rows.length}\n`);

centros.rows.forEach(c => {
  const empresa = c.Empresa ? ` [Empresa ${c.Empresa}]` : '';
  const inativo = c.Inativo ? ' [INATIVO]' : '';
  console.log(`[${c.Codigo}] ${c.Codigo_Texto || c.Descrição || 'Sem descrição'}${empresa}${inativo}`);
});

console.log('\n\n');

// 3. Ver quais centros de custo são usados em Contas_Receber
console.log('📊 Centros de Custo mais usados em Contas_Receber:\n');

const usage = await pool.query(`
  SELECT
    cr."Centro_Custo",
    COUNT(*) as quantidade,
    SUM(cr."Total") as total_valor
  FROM "Contas_Receber" cr
  WHERE cr."Centro_Custo" IS NOT NULL
  GROUP BY cr."Centro_Custo"
  ORDER BY quantidade DESC
  LIMIT 20
`);

usage.rows.forEach(u => {
  console.log(`  ${u.Centro_Custo}: ${u.quantidade} cobrança(s) - R$ ${parseFloat(u.total_valor).toFixed(2)}`);
});

await pool.end();
