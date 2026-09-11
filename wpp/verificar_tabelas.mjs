import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🔍 Verificando estrutura das tabelas...\n');

try {
  // 1. Verificar tabela Clientes
  console.log('📊 Tabela: Clientes');
  const clientes = await pool.query(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'clientes'
    ORDER BY ordinal_position
    LIMIT 20
  `);

  if (clientes.rows.length === 0) {
    console.log('⚠️ Tabela Clientes NÃO ENCONTRADA! Tentando com maiúscula...');
    const clientesMaiusc = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Clientes'
      ORDER BY ordinal_position
      LIMIT 20
    `);
    console.table(clientesMaiusc.rows);
  } else {
    console.table(clientes.rows);
  }

  // 2. Verificar tabela Contas_Receber
  console.log('\n📊 Tabela: Contas_Receber');
  const cr = await pool.query(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'contas_receber'
    ORDER BY ordinal_position
    LIMIT 20
  `);

  if (cr.rows.length === 0) {
    console.log('⚠️ Tabela contas_receber NÃO ENCONTRADA! Tentando Contas_Receber...');
    const crMaiusc = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Contas_Receber'
      ORDER BY ordinal_position
      LIMIT 20
    `);
    console.table(crMaiusc.rows);
  } else {
    console.table(cr.rows);
  }

  // 3. Listar TODAS as tabelas disponíveis
  console.log('\n📋 Todas as tabelas do banco:');
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.table(tables.rows);

} catch (e) {
  console.error('❌', e.message);
} finally {
  await pool.end();
}
