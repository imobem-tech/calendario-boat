import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function executarMigracao() {
  console.log('🚀 Iniciando migração...');
  try {
    console.log('📝 Adicionando colunas...');
    await pool.query(\`ALTER TABLE bank_categorias ADD COLUMN IF NOT EXISTS empresa VARCHAR(50)\`);
    await pool.query(\`ALTER TABLE bank_categorias ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true\`);
    await pool.query(\`ALTER TABLE bank_regras_classificacao ADD COLUMN IF NOT EXISTS empresa VARCHAR(50)\`);
    await pool.query(\`ALTER TABLE bank_regras_classificacao ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true\`);
    console.log('✅ Colunas adicionadas!');

    console.log('📝 Atualizando registros...');
    await pool.query(\`UPDATE bank_categorias SET empresa = 'TODAS' WHERE empresa IS NULL\`);
    await pool.query(\`UPDATE bank_regras_classificacao SET empresa = 'TODAS' WHERE empresa IS NULL\`);
    console.log('✅ Atualizados!');

    console.log('📝 NOT NULL...');
    await pool.query(\`ALTER TABLE bank_categorias ALTER COLUMN empresa SET NOT NULL\`);
    await pool.query(\`ALTER TABLE bank_regras_classificacao ALTER COLUMN empresa SET NOT NULL\`);
    console.log('✅ NOT NULL!');

    console.log('📝 Índices...');
    await pool.query(\`CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON bank_categorias(empresa, ativo)\`);
    await pool.query(\`CREATE INDEX IF NOT EXISTS idx_regras_empresa ON bank_regras_classificacao(empresa, ativo)\`);
    console.log('✅ Índices!');

    console.log('📝 Categorias ALLMAX...');
    const cats = [
      ['ALLMAX', 'Receita - Mensalidade Embarcação', 'RECEITA', '#22c55e', '💰', 1],
      ['ALLMAX', 'Receita - Venda de Cotas', 'RECEITA', '#22c55e', '🎫', 2],
      ['ALLMAX', 'Receita - Taxa de Manutenção', 'RECEITA', '#22c55e', '🔧', 3],
      ['ALLMAX', 'Despesa - Manutenção Embarcação', 'DESPESA', '#ef4444', '🔧', 10],
      ['ALLMAX', 'Despesa - Combustível', 'DESPESA', '#ef4444', '⛽', 11]
    ];
    for (const c of cats) {
      await pool.query(\`INSERT INTO bank_categorias (empresa,nome,tipo,cor,icone,ordem) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING\`, c);
    }
    console.log('✅ Categorias!');

    console.log('📝 Regras...');
    await pool.query(\`INSERT INTO bank_regras_classificacao (empresa,nome_regra,classificacao,palavras_chave,confianca_base) VALUES ('ALLMAX','Mensalidade','Receita - Mensalidade Embarcação','mensalidade',90) ON CONFLICT DO NOTHING\`);
    console.log('✅ Regras!');

    const r = await pool.query(\`SELECT empresa, COUNT(*) as total FROM bank_categorias GROUP BY empresa\`);
    console.log('📊 Resultados:', r.rows);

    console.log('🎉 SUCESSO!');
  } catch (e) {
    console.error('❌ ERRO:', e.message);
  } finally {
    await pool.end();
  }
}

executarMigracao();
