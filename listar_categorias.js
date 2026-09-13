import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const result = await pool.query(`
  SELECT
    id,
    empresa,
    nome,
    tipo,
    palavras_chave
  FROM bank_categorias
  WHERE ativo = true
  ORDER BY
    empresa,
    CASE WHEN tipo = 'CREDITO' THEN 1 ELSE 2 END,
    nome
`);

console.log('\n📊 CATEGORIAS COM PALAVRAS-CHAVE:\n');
console.log('ID'.padEnd(5) + 'EMPRESA'.padEnd(10) + 'TIPO'.padEnd(10) + 'NOME'.padEnd(40) + 'PALAVRAS-CHAVE');
console.log('='.repeat(120));

for (const cat of result.rows) {
  const palavras = cat.palavras_chave || '(sem palavras)';
  console.log(
    String(cat.id).padEnd(5) +
    cat.empresa.padEnd(10) +
    cat.tipo.padEnd(10) +
    cat.nome.padEnd(40) +
    palavras
  );
}

await pool.end();
