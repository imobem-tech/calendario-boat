// ============================================================
// ver_palavras_chave.js — V.260912140000
// VISUALIZA PALAVRAS-CHAVE DAS CATEGORIAS
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  const result = await pool.query(`
    SELECT
      id,
      empresa,
      nome,
      tipo,
      palavras_chave,
      ordem
    FROM bank_categorias
    WHERE ativo = true
    ORDER BY
      empresa,
      CASE WHEN tipo = 'CREDITO' THEN 1 ELSE 2 END,
      ordem,
      nome
  `);

  console.log('\n' + '='.repeat(120));
  console.log('📊 CATEGORIAS COM PALAVRAS-CHAVE');
  console.log('='.repeat(120) + '\n');

  let empresaAtual = '';
  let tipoAtual = '';

  for (const cat of result.rows) {
    // Separador por empresa
    if (cat.empresa !== empresaAtual) {
      empresaAtual = cat.empresa;
      console.log('\n' + '━'.repeat(120));
      console.log(`🏢 ${cat.empresa}`);
      console.log('━'.repeat(120));
    }

    // Separador por tipo
    if (cat.tipo !== tipoAtual) {
      tipoAtual = cat.tipo;
      const emoji = cat.tipo === 'CREDITO' ? '💰' : '💸';
      console.log(`\n${emoji} ${cat.tipo}:`);
      console.log('─'.repeat(120));
    }

    // Categoria
    const palavras = cat.palavras_chave || '(sem palavras-chave definidas)';
    console.log(`\n[${cat.id.toString().padStart(3, '0')}] ${cat.nome}`);
    console.log(`     Palavras: ${palavras}`);
  }

  console.log('\n' + '='.repeat(120));
  console.log(`\n✅ Total: ${result.rows.length} categorias`);

  const comPalavras = result.rows.filter(c => c.palavras_chave && c.palavras_chave.trim() !== '').length;
  const semPalavras = result.rows.length - comPalavras;

  console.log(`   Com palavras-chave: ${comPalavras}`);
  console.log(`   Sem palavras-chave: ${semPalavras}\n`);

} catch (err) {
  console.error('❌ Erro ao buscar categorias:', err.message);
} finally {
  await pool.end();
}

// ============================================================
// FIM
// ============================================================
