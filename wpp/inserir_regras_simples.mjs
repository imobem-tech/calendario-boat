import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🚀 Inserindo regras ALLMAX...');

try {
  // Usar valores decimais (0.90 = 90%, 0.85 = 85%)
  await pool.query("INSERT INTO bank_regras_classificacao (empresa,nome_regra,classificacao,palavras_chave,confianca_base) VALUES ('ALLMAX','Mensalidade','Receita - Mensalidade Embarcação','mensalidade,cobranca mensal',0.90) ON CONFLICT DO NOTHING");
  console.log('✅ Regra Mensalidade');

  await pool.query("INSERT INTO bank_regras_classificacao (empresa,nome_regra,classificacao,palavras_chave,confianca_base) VALUES ('ALLMAX','Venda Cota','Receita - Venda de Cotas','venda,cota',0.85) ON CONFLICT DO NOTHING");
  console.log('✅ Regra Venda Cota');

  await pool.query("INSERT INTO bank_regras_classificacao (empresa,nome_regra,classificacao,palavras_chave,confianca_base) VALUES ('ALLMAX','Combustível','Despesa - Combustível','combustivel,gasolina',0.90) ON CONFLICT DO NOTHING");
  console.log('✅ Regra Combustível');

  // Verificar
  const cats = await pool.query('SELECT empresa, COUNT(*) as total FROM bank_categorias WHERE ativo = true GROUP BY empresa');
  console.log('\n📊 Categorias:');
  console.table(cats.rows);

  const regras = await pool.query('SELECT empresa, COUNT(*) as total FROM bank_regras_classificacao WHERE ativo = true GROUP BY empresa');
  console.log('📊 Regras:');
  console.table(regras.rows);

  console.log('\n🎉 MIGRAÇÃO COMPLETA!');

} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
