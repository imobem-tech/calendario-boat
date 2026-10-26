// Investigar orçamento ORC-261025152542
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔍 INVESTIGANDO ORÇAMENTO ORC-261025152542\n');

    // 1. Buscar orçamento
    const orc = await pool.query(`
      SELECT
        id_orcamento,
        numero,
        numero_pb,
        descricao,
        valor_servicos,
        taxa_servico_perc,
        taxa_servico_valor,
        valor_total,
        status
      FROM orcamento_servico
      WHERE numero = 'ORC-261025152542'
    `);

    if (orc.rows.length === 0) {
      console.log('❌ Orçamento não encontrado\n');
      await pool.end();
      return;
    }

    const o = orc.rows[0];
    console.log('📋 ORÇAMENTO:');
    console.log(`   Número: ${o.numero}`);
    console.log(`   PB: ${o.numero_pb}`);
    console.log(`   Valor Serviços: ${o.valor_servicos}`);
    console.log(`   Taxa %: ${o.taxa_servico_perc}`);
    console.log(`   Taxa R$: ${o.taxa_servico_valor}`);
    console.log(`   TOTAL: ${o.valor_total}`);
    console.log(`   Status: ${o.status}`);

    // 2. Buscar TODOS os registros de rateio
    console.log('\n📊 RATEIO (TODOS OS REGISTROS):\n');
    const rateio = await pool.query(`
      SELECT
        r.id_rateio,
        r.id_autorizado,
        r.valor_cotista,
        r.percentual,
        r.participando,
        a."Gropo_letra" as grupo
      FROM orcamento_rateio r
      JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      WHERE r.id_orcamento = $1
      ORDER BY a."Gropo_letra", r.id_rateio
    `, [o.id_orcamento]);

    console.log('ID   | Grupo | Autorizado | Valor    | %      | Part.');
    console.log('-----|-------|------------|----------|--------|------');

    let totalParticipando = 0;
    rateio.rows.forEach(r => {
      console.log(
        `${String(r.id_rateio).padEnd(4)} | ${(r.grupo || '?').padEnd(5)} | ` +
        `${String(r.id_autorizado).padEnd(10)} | ${String(r.valor_cotista).padEnd(8)} | ` +
        `${String(r.percentual).padEnd(6)} | ${r.participando ? 'SIM' : 'NÃO'}`
      );
      if (r.participando) {
        totalParticipando += parseFloat(r.valor_cotista);
      }
    });

    console.log('\n═'.repeat(70));
    console.log(`Total de registros: ${rateio.rows.length}`);
    console.log(`Participando: ${rateio.rows.filter(r => r.participando).length}`);
    console.log(`Soma (participando): R$ ${totalParticipando.toFixed(2)}`);
    console.log(`Total do orçamento: R$ ${o.valor_total}`);
    console.log(`Diferença: R$ ${(totalParticipando - parseFloat(o.valor_total)).toFixed(2)}`);
    console.log('═'.repeat(70));

    // 3. Simular EXATAMENTE a query do preview
    console.log('\n🔎 SIMULANDO QUERY DO PREVIEW (GROUP BY):\n');
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
    `, [o.numero_pb, o.id_orcamento]);

    console.log('Grupo | Soma Valores | Qtd Registros | ID WhatsApp');
    console.log('------|--------------|---------------|-------------');
    preview.rows.forEach(p => {
      console.log(
        `${(p.grupo_letra || '?').padEnd(5)} | ` +
        `${String(p.valor_grupo).padEnd(12)} | ` +
        `${String(p.qtd_cotistas).padEnd(13)} | ` +
        `${p.id_grupo_wpp || 'não cadastrado'}`
      );
    });

    const totalPreview = preview.rows.reduce((sum, p) => sum + parseFloat(p.valor_grupo), 0);
    console.log('\n═'.repeat(70));
    console.log(`Total mostrado no preview: R$ ${totalPreview.toFixed(2)}`);
    console.log(`Total do orçamento: R$ ${o.valor_total}`);

    if (Math.abs(totalPreview - parseFloat(o.valor_total)) > 0.01) {
      console.log(`❌ ERRO: Diferença de R$ ${(totalPreview - parseFloat(o.valor_total)).toFixed(2)}!`);

      if (preview.rows.some(p => p.qtd_cotistas > 1)) {
        console.log('\n⚠️  DIAGNÓSTICO: Há grupos com MAIS DE 1 registro!');
        console.log('   → A função SUM() está somando registros DUPLICADOS!');
      }
    } else {
      console.log('✅ Valores conferem!');
    }
    console.log('═'.repeat(70));

    await pool.end();
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
