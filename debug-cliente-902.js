import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔍 Buscando TODAS as cobranças do cliente 902 (RICARDO NUNES CAVALCANTE):\n');

const result = await pool.query(`
  SELECT
    "ID",
    "Código_Cliente",
    "Descrição",
    "Total",
    "Data_Vencimento",
    "Data_Pagamento",
    "Nro_Venda",
    "CPF_CNPJ_CR"
  FROM "Contas_Receber"
  WHERE "Código_Cliente" = 902
  ORDER BY "Data_Vencimento" DESC
  LIMIT 20
`);

if (result.rows.length > 0) {
  console.log(`✅ Encontrado ${result.rows.length} cobrança(s):\n`);
  result.rows.forEach((r, i) => {
    console.log(`[${i + 1}] ID ${r.ID}:`);
    console.log(`    Valor: R$ ${r.Total}`);
    console.log(`    Vencimento: ${r.Data_Vencimento}`);
    console.log(`    Pagamento: ${r.Data_Pagamento || 'Não pago'}`);
    console.log(`    Descrição: ${r.Descrição}`);
    console.log(`    Nro_Venda: ${r.Nro_Venda || 'Não informado'}`);
    console.log(`    CPF_CNPJ_CR: ${r.CPF_CNPJ_CR || 'NULL'}`);
    console.log('');
  });
} else {
  console.log('❌ Nenhuma cobrança encontrada para este cliente');
}

await pool.end();
