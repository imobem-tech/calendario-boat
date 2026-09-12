import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔍 Verificando qual Centro_Custo a IMOBEM usa:\n');

// Buscar algumas cobranças da IMOBEM (Empresa = 9)
const result = await pool.query(`
  SELECT
    cr."ID",
    cr."Descrição",
    cr."Total",
    cr."Centro_Custo",
    cr."Código_Cliente",
    cr."Data_Vencimento",
    cr."Nro_Venda",
    cr."Empresa"
  FROM "Contas_Receber" cr
  WHERE cr."Empresa" = 9
  ORDER BY cr."Data_Vencimento" DESC
  LIMIT 50
`);

if (result.rows.length > 0) {
  console.log(`✅ Encontrado ${result.rows.length} cobrança(s) da IMOBEM:\n`);

  // Agrupar por Centro_Custo
  const porCentroCusto = {};

  result.rows.forEach(r => {
    const cc = r.Centro_Custo || 'NULL';
    if (!porCentroCusto[cc]) {
      porCentroCusto[cc] = [];
    }
    porCentroCusto[cc].push(r);
  });

  console.log('📊 Distribuição por Centro_Custo:\n');
  Object.entries(porCentroCusto).forEach(([cc, items]) => {
    console.log(`Centro_Custo ${cc}: ${items.length} cobrança(s)`);
    items.slice(0, 3).forEach(r => {
      console.log(`  - ${r.Descrição?.substring(0, 50)} - R$ ${r.Total}`);
    });
    console.log('');
  });

} else {
  console.log('❌ Nenhuma cobrança da IMOBEM encontrada');
}

await pool.end();
