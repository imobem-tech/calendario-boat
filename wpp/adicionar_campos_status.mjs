import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🚀 Adicionando campos de status...\n');

try {
  // 1. Adicionar status_classificacao
  console.log('📝 Adicionando status_classificacao...');
  await pool.query(`
    ALTER TABLE bank_extratos
    ADD COLUMN IF NOT EXISTS status_classificacao VARCHAR(20) DEFAULT 'PENDENTE'
  `);
  console.log('✅ status_classificacao adicionado!');

  // 2. Adicionar id_cobranca (FK para Contas_Receber)
  console.log('📝 Adicionando id_cobranca...');
  await pool.query(`
    ALTER TABLE bank_extratos
    ADD COLUMN IF NOT EXISTS id_cobranca INTEGER
  `);
  console.log('✅ id_cobranca adicionado!');

  // 3. Adicionar cliente_id (FK para Cliente)
  console.log('📝 Adicionando cliente_id...');
  await pool.query(`
    ALTER TABLE bank_extratos
    ADD COLUMN IF NOT EXISTS cliente_id INTEGER
  `);
  console.log('✅ cliente_id adicionado!');

  // 4. Adicionar observacoes
  console.log('📝 Adicionando observacoes...');
  await pool.query(`
    ALTER TABLE bank_extratos
    ADD COLUMN IF NOT EXISTS observacoes TEXT
  `);
  console.log('✅ observacoes adicionado!');

  // 5. Criar índice para status
  console.log('📝 Criando índice...');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_status_classificacao
    ON bank_extratos(status_classificacao, importado_em DESC)
  `);
  console.log('✅ Índice criado!');

  // 6. Atualizar registros existentes classificados para OK
  console.log('📝 Atualizando registros existentes...');
  const result = await pool.query(`
    UPDATE bank_extratos
    SET status_classificacao = 'OK'
    WHERE classificacao IS NOT NULL
      AND status_classificacao = 'PENDENTE'
  `);
  console.log(`✅ ${result.rowCount} registros atualizados para OK!`);

  // 7. Verificar resultado
  console.log('\n📊 Estatísticas:');
  const stats = await pool.query(`
    SELECT
      status_classificacao,
      COUNT(*) as total
    FROM bank_extratos
    GROUP BY status_classificacao
    ORDER BY status_classificacao
  `);
  console.table(stats.rows);

  console.log('\n🎉 CAMPOS ADICIONADOS COM SUCESSO!');

} catch (e) {
  console.error('❌ ERRO:', e.message);
  console.error(e);
} finally {
  await pool.end();
}
