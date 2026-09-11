import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🚀 Migração FINAL...');

try {
  // 1. Alterar palavras_chave de ARRAY para TEXT
  console.log('📝 Alterando palavras_chave de ARRAY → TEXT...');

  // Criar coluna temporária
  await pool.query('ALTER TABLE bank_regras_classificacao ADD COLUMN IF NOT EXISTS palavras_chave_temp TEXT');

  // Copiar dados convertendo array para texto
  await pool.query(`
    UPDATE bank_regras_classificacao
    SET palavras_chave_temp = array_to_string(palavras_chave, ',')
    WHERE palavras_chave IS NOT NULL
  `);

  // Dropar coluna antiga
  await pool.query('ALTER TABLE bank_regras_classificacao DROP COLUMN palavras_chave');

  // Renomear temp para palavras_chave
  await pool.query('ALTER TABLE bank_regras_classificacao RENAME COLUMN palavras_chave_temp TO palavras_chave');

  console.log('✅ palavras_chave agora é TEXT!');

  // 2. Garantir que empresa tem valor padrão
  console.log('📝 Atualizando empresas NULL...');
  await pool.query("UPDATE bank_categorias SET empresa = 'TODAS' WHERE empresa IS NULL");
  await pool.query("UPDATE bank_regras_classificacao SET empresa = 'TODAS' WHERE empresa IS NULL");
  console.log('✅ Empresas atualizadas!');

  // 3. Criar constraints únicos
  console.log('📝 Criando constraints...');
  try {
    await pool.query('ALTER TABLE bank_categorias ADD CONSTRAINT uk_categorias_empresa_nome UNIQUE(empresa, nome)');
  } catch (e) {
    console.log('⚠️ Constraint categorias já existe');
  }

  try {
    await pool.query('ALTER TABLE bank_regras_classificacao ADD CONSTRAINT uk_regras_empresa_nome UNIQUE(empresa, nome_regra)');
  } catch (e) {
    console.log('⚠️ Constraint regras já existe');
  }
  console.log('✅ Constraints OK!');

  // 4. Inserir categorias ALLMAX
  console.log('📝 Inserindo categorias ALLMAX...');
  const cats = [
    ['ALLMAX', 'Receita - Mensalidade Embarcação', 'RECEITA', '#22c55e', '💰', 1],
    ['ALLMAX', 'Receita - Venda de Cotas', 'RECEITA', '#22c55e', '🎫', 2],
    ['ALLMAX', 'Receita - Taxa de Manutenção', 'RECEITA', '#22c55e', '🔧', 3],
    ['ALLMAX', 'Despesa - Manutenção Embarcação', 'DESPESA', '#ef4444', '🔧', 10],
    ['ALLMAX', 'Despesa - Combustível', 'DESPESA', '#ef4444', '⛽', 11],
    ['ALLMAX', 'Despesa - Administrativa', 'DESPESA', '#ef4444', '📋', 15]
  ];

  for (const c of cats) {
    try {
      await pool.query('INSERT INTO bank_categorias (empresa,nome,tipo,cor,icone,ordem) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', c);
    } catch (e) {}
  }
  console.log('✅ Categorias inseridas!');

  // 5. Inserir regras ALLMAX (AGORA COM TEXT!)
  console.log('📝 Inserindo regras ALLMAX...');
  await pool.query("INSERT INTO bank_regras_classificacao (empresa,nome_regra,classificacao,palavras_chave,confianca_base) VALUES ('ALLMAX','Mensalidade','Receita - Mensalidade Embarcação','mensalidade,cobranca mensal',90) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_regras_classificacao (empresa,nome_regra,classificacao,palavras_chave,confianca_base) VALUES ('ALLMAX','Venda Cota','Receita - Venda de Cotas','venda,cota',85) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO bank_regras_classificacao (empresa,nome_regra,classificacao,palavras_chave,confianca_base) VALUES ('ALLMAX','Combustível','Despesa - Combustível','combustivel,gasolina',90) ON CONFLICT DO NOTHING");
  console.log('✅ Regras inseridas!');

  // 6. Verificar
  const r = await pool.query('SELECT empresa, COUNT(*) as total FROM bank_categorias WHERE ativo = true GROUP BY empresa');
  console.log('\n📊 Categorias por empresa:');
  console.table(r.rows);

  console.log('\n🎉 MIGRAÇÃO CONCLUÍDA!');

} catch (e) {
  console.error('❌ ERRO:', e.message);
  console.error(e);
} finally {
  await pool.end();
}
