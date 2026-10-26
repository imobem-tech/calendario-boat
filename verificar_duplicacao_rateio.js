// Verificar duplicação no rateio
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔍 VERIFICANDO DUPLICAÇÃO NO RATEIO\n');

    // Buscar TODOS os registros
    const todos = await pool.query(`
      SELECT
        r.id_rateio,
        r.id_autorizado,
        r.valor_cotista,
        r.percentual,
        r.participando,
        a."Gropo_letra" as grupo
      FROM orcamento_rateio r
      JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      WHERE r.id_orcamento = 50
      ORDER BY r.id_rateio
    `);

    console.log('📋 TODOS os registros:\n');
    console.log('ID  | Grupo | Valor    | %      | Part.');
    console.log('----|-------|----------|--------|------');

    todos.rows.forEach(r => {
      console.log(`${String(r.id_rateio).padEnd(3)} | ${(r.grupo || '?').padEnd(5)} | ${String(r.valor_cotista).padEnd(8)} | ${String(r.percentual).padEnd(6)} | ${r.participando ? 'SIM' : 'NÃO'}`);
    });

    const participando = todos.rows.filter(r => r.participando);
    const totalParticipando = participando.reduce((sum, r) => sum + parseFloat(r.valor_cotista), 0);

    console.log('\n═'.repeat(40));
    console.log(`Total de registros: ${todos.rows.length}`);
    console.log(`Participando: ${participando.length}`);
    console.log(`Soma (participando): R$ ${totalParticipando.toFixed(2)}`);
    console.log('═'.repeat(40));

    // Simular EXATAMENTE a query do preview
    console.log('\n🔎 SIMULANDO QUERY EXATA DO PREVIEW:\n');

    const orc = await pool.query('SELECT numero_pb FROM orcamento_servico WHERE id_orcamento = 50');
    const pb = orc.rows[0].numero_pb;

    console.log(`PB do orçamento: ${pb}\n`);

    const preview = await pool.query(`
      SELECT
        a."Gropo_letra" as grupo_letra,
        SUM(r.valor_cotista) as valor_grupo,
        COUNT(*) as qtd_cotistas,
        MAX(wg.grupowppid) as id_grupo_wpp,
        MAX(wg.nomegrupowpp) as nome_grupo
      FROM orcamento_rateio r
      JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      LEFT JOIN wpp_grupos_agenda wg
        ON wg.pb = $1
        AND wg.cota = a."Gropo_letra"
      WHERE r.id_orcamento = $2
        AND r.participando = true
      GROUP BY a."Gropo_letra"
      ORDER BY a."Gropo_letra"
    `, [pb, 50]);

    console.log('Resultado da query do preview:');
    preview.rows.forEach(p => {
      console.log(`   ${p.grupo_letra}: R$ ${p.valor_grupo} (${p.qtd_cotistas} registro(s))`);
    });

    console.log('\n💡 DIAGNÓSTICO:');
    if (preview.rows[0]?.qtd_cotistas > 1) {
      console.log('   ❌ Há MAIS DE 1 registro para o mesmo grupo!');
      console.log('   → A SUM() está somando registros duplicados!');
    } else {
      console.log('   ✅ Apenas 1 registro por grupo');
      console.log('   → Problema deve estar em outro lugar');
    }

    await pool.end();
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
