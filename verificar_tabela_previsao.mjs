import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

console.log('\n🔍 Verificando tabela wpp_previsao_enviada...\n');

try {
  // Verificar se tabela existe
  const tabela = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'wpp_previsao_enviada'
    )
  `);

  if (tabela.rows[0].exists) {
    console.log('✅ Tabela wpp_previsao_enviada existe!');

    // Contar registros
    const count = await pool.query('SELECT COUNT(*) FROM wpp_previsao_enviada');
    console.log(`📊 Registros: ${count.rows[0].count}`);

    // Mostrar últimos 5
    const ultimos = await pool.query(`
      SELECT grupowppid, data_envio, tipo,
             hora_envio AT TIME ZONE 'America/Sao_Paulo' as hora_br
      FROM wpp_previsao_enviada
      ORDER BY hora_envio DESC
      LIMIT 5
    `);

    if (ultimos.rows.length > 0) {
      console.log('\n📋 Últimos envios registrados:');
      ultimos.rows.forEach(r => {
        console.log(`  - ${r.data_envio} ${r.tipo}: ${r.grupowppid.substring(0, 20)}... (${r.hora_br})`);
      });
    }

    // Verificar funções
    const funcoes = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('ja_enviou_previsao', 'registrar_envio_previsao')
    `);

    console.log(`\n✅ Funções criadas: ${funcoes.rows.length}/2`);
    funcoes.rows.forEach(f => console.log(`   - ${f.routine_name}()`));

  } else {
    console.log('❌ Tabela wpp_previsao_enviada NÃO existe!');
    console.log('   Execute: node executar_fix_previsao.mjs');
  }

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
