import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Caso 1: RICARDO NUNES CAVALCANTE - CPF 87703491187 - Valor 348.70
const cpf = '87703491187';
const valor = 348.70;
const valorMin = valor * 0.98;
const valorMax = valor * 1.02;

console.log('🔍 Investigando cobrança:');
console.log(`  CPF: ${cpf}`);
console.log(`  Valor: R$ ${valor}`);
console.log(`  Faixa: R$ ${valorMin.toFixed(2)} - R$ ${valorMax.toFixed(2)}`);
console.log('');

// 1. Verificar se existe esse CPF na tabela Contas_Receber
console.log('1️⃣ Buscando por CPF_CNPJ_CR exato:');
let result = await pool.query(`
  SELECT "ID", "CPF_CNPJ_CR", "Descrição", "Total", "Nro_Venda"
  FROM "Contas_Receber"
  WHERE "CPF_CNPJ_CR" = $1
  LIMIT 5
`, [cpf]);

if (result.rows.length > 0) {
  console.log(`  ✅ Encontrado ${result.rows.length} registro(s):`);
  result.rows.forEach(r => {
    console.log(`     ID ${r.ID}: R$ ${r.Total} - ${r.Descrição?.substring(0, 40)}`);
  });
} else {
  console.log(`  ❌ Nenhum registro encontrado`);
}

console.log('');

// 2. Buscar por CPF com qualquer formatação
console.log('2️⃣ Buscando CPF com LIKE (qualquer formatação):');
result = await pool.query(`
  SELECT "ID", "CPF_CNPJ_CR", "Descrição", "Total", "Nro_Venda"
  FROM "Contas_Receber"
  WHERE "CPF_CNPJ_CR" LIKE $1
  LIMIT 5
`, [`%${cpf}%`]);

if (result.rows.length > 0) {
  console.log(`  ✅ Encontrado ${result.rows.length} registro(s):`);
  result.rows.forEach(r => {
    console.log(`     ID ${r.ID}: CPF ${r.CPF_CNPJ_CR} - R$ ${r.Total} - ${r.Descrição?.substring(0, 40)}`);
  });
} else {
  console.log(`  ❌ Nenhum registro encontrado`);
}

console.log('');

// 3. Verificar se tem alguma cobrança com valor próximo
console.log('3️⃣ Buscando por valor próximo (±2%):');
result = await pool.query(`
  SELECT "ID", "CPF_CNPJ_CR", "Descrição", "Total", "Nro_Venda", "Código_Cliente"
  FROM "Contas_Receber"
  WHERE "Total" BETWEEN $1 AND $2
  ORDER BY ABS("Total" - $3)
  LIMIT 5
`, [valorMin, valorMax, valor]);

if (result.rows.length > 0) {
  console.log(`  ✅ Encontrado ${result.rows.length} registro(s) com valor similar:`);
  result.rows.forEach(r => {
    console.log(`     ID ${r.ID}: CPF ${r.CPF_CNPJ_CR} (Cliente ${r.Código_Cliente}) - R$ ${r.Total} - ${r.Descrição?.substring(0, 40)}`);
  });
} else {
  console.log(`  ❌ Nenhum registro encontrado`);
}

console.log('');

// 4. Buscar pelo Código_Cliente
console.log('4️⃣ Verificando se o CPF está na tabela Cliente:');
result = await pool.query(`
  SELECT "ID", "Cliente_Nome", "Cliente_CPF"
  FROM "Cliente"
  WHERE "Cliente_CPF" = $1
`, [cpf]);

if (result.rows.length > 0) {
  console.log(`  ✅ Cliente encontrado:`);
  result.rows.forEach(r => {
    console.log(`     ID ${r.ID}: ${r.Cliente_Nome} - CPF ${r.Cliente_CPF}`);
  });

  // Agora buscar em Contas_Receber pelo Código_Cliente
  const clienteId = result.rows[0].ID;
  console.log('');
  console.log(`5️⃣ Buscando cobranças pelo Código_Cliente (${clienteId}):`);

  result = await pool.query(`
    SELECT "ID", "CPF_CNPJ_CR", "Descrição", "Total", "Nro_Venda", "Código_Cliente"
    FROM "Contas_Receber"
    WHERE "Código_Cliente" = $1
      AND "Total" BETWEEN $2 AND $3
    ORDER BY ABS("Total" - $4)
    LIMIT 5
  `, [clienteId, valorMin, valorMax, valor]);

  if (result.rows.length > 0) {
    console.log(`  ✅ Encontrado ${result.rows.length} cobrança(s):`);
    result.rows.forEach(r => {
      console.log(`     ID ${r.ID}: CPF_CNPJ_CR="${r.CPF_CNPJ_CR}" - R$ ${r.Total} - ${r.Descrição?.substring(0, 40)}`);
    });
  } else {
    console.log(`  ❌ Nenhuma cobrança encontrada para esse cliente com esse valor`);
  }
} else {
  console.log(`  ❌ Cliente não encontrado`);
}

await pool.end();
