import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🚀 Iniciando migração...');

try {
  console.log('📝 Step 1: Adicionando colunas...');
  await pool.query('ALTER TABLE bank_categorias ADD COLUMN IF NOT EXISTS empresa VARCHAR(50)');
  await pool.query('ALTER TABLE bank_categorias ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true');
  await pool.query('ALTER TABLE bank_regras_classificacao ADD COLUMN IF NOT EXISTS empresa VARCHAR(50)');
  await pool.query('ALTER TABLE bank_regras_classificacao ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true');
  console.log('✅ Colunas adicionadas!');

  console.log('📝 Step 2: Atualizando registros existentes...');
  await pool.query("UPDATE bank_categorias SET empresa = 'TODAS' WHERE empresa IS NULL");
  await pool.query("UPDATE bank_regras_classificacao SET empresa = 'TODAS' WHERE empresa IS NULL");
  console.log('✅ Registros atualizados!');

  console.log('📝 Step 3: Definindo NOT NULL...');
  await pool.query('ALTER TABLE bank_categorias ALTER COLUMN empresa SET NOT NULL');
  await pool.query('ALTER TABLE bank_regras_classificacao ALTER COLUMN empresa SET NOT NULL');
  console.log('✅ NOT NULL definido!');

  console.log('📝 Step 4: Criando índices...');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON bank_categorias(empresa, ativo)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_regras_empresa ON bank_regras_classificacao(empresa, ativo)');
  console.log('✅ Índices criados!');

  console.log('📝 Step 5: Inserindo categorias ALLMAX...');
  await pool.query("INSERT INTO bank_categorias (empresa, nome, tipo, cor, icone, ordem) VALUES ('ALLMAX', 'Receita - Mensalidade Embarcação', 'RECEITA', '#22c55e', '💰', 1) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_categorias (empresa, nome, tipo, cor, icone, ordem) VALUES ('ALLMAX', 'Receita - Venda de Cotas', 'RECEITA', '#22c55e', '🎫', 2) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_categorias (empresa, nome, tipo, cor, icone, ordem) VALUES ('ALLMAX', 'Receita - Taxa de Manutenção', 'RECEITA', '#22c55e', '🔧', 3) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_categorias (empresa, nome, tipo, cor, icone, ordem) VALUES ('ALLMAX', 'Despesa - Manutenção Embarcação', 'DESPESA', '#ef4444', '🔧', 10) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_categorias (empresa, nome, tipo, cor, icone, ordem) VALUES ('ALLMAX', 'Despesa - Combustível', 'DESPESA', '#ef4444', '⛽', 11) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_categorias (empresa, nome, tipo, cor, icone, ordem) VALUES ('ALLMAX', 'Despesa - Administrativa', 'DESPESA', '#ef4444', '📋', 15) ON CONFLICT DO NOTHING");
  console.log('✅ Categorias inseridas!');

  console.log('📝 Step 6: Inserindo regras ALLMAX...');
  await pool.query("INSERT INTO bank_regras_classificacao (empresa, nome_regra, classificacao, palavras_chave, confianca_base) VALUES ('ALLMAX', 'Mensalidade', 'Receita - Mensalidade Embarcação', 'mensalidade,cobranca mensal', 90) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_regras_classificacao (empresa, nome_regra, classificacao, palavras_chave, confianca_base) VALUES ('ALLMAX', 'Venda Cota', 'Receita - Venda de Cotas', 'venda,cota', 85) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_regras_classificacao (empresa, nome_regra, classificacao, palavras_chave, confianca_base) VALUES ('ALLMAX', 'Combustível', 'Despesa - Combustível', 'combustivel,gasolina', 90) ON CONFLICT DO NOTHING");
  console.log('✅ Regras inseridas!');

  console.log('📊 Step 7: Verificando resultados...');
  const result = await pool.query('SELECT empresa, COUNT(*) as total FROM bank_categorias GROUP BY empresa ORDER BY empresa');
  console.log('✅ Categorias por empresa:');
  result.rows.forEach(row => console.log(`   ${row.empresa}: ${row.total}`));

  console.log('\n🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');

} catch (error) {
  console.error('\n❌ ERRO:', error.message);
  console.error(error);
} finally {
  await pool.end();
}
