// Verificar valores do orçamento ORC-261025102936
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔍 INVESTIGANDO VALORES DO ORÇAMENTO\n');

    // 1. Buscar orçamento
    const orc = await pool.query(`
      SELECT
        id_orcamento,
        numero,
        valor_servicos,
        taxa_servico_perc,
        taxa_servico_valor,
        valor_total
      FROM orcamento_servico
      WHERE numero = 'ORC-261025102936'
    `);

    if (orc.rows.length === 0) {
      console.log('❌ Orçamento não encontrado\n');
      await pool.end();
      return;
    }

    const o = orc.rows[0];
    console.log('📋 ORÇAMENTO:', o.numero);
    console.log('   Valor Serviços:', o.valor_servicos);
    console.log('   Taxa %:', o.taxa_servico_perc);
    console.log('   Taxa R$:', o.taxa_servico_valor);
    console.log('   TOTAL:', o.valor_total);

    // 2. Buscar rateio
    console.log('\n📊 RATEIO:\n');
    const rateio = await pool.query(`
      SELECT
        r.id_rateio,
        r.valor_cotista,
        r.percentual,
        r.participando,
        a."Gropo_letra" as grupo
      FROM orcamento_rateio r
      JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      WHERE r.id_orcamento = $1
      ORDER BY a."Gropo_letra"
    `, [o.id_orcamento]);

    let totalRateio = 0;
    rateio.rows.forEach(r => {
      console.log(`   Grupo ${r.grupo}:`);
      console.log(`      Valor: R$ ${r.valor_cotista}`);
      console.log(`      %: ${r.percentual}`);
      console.log(`      Participando: ${r.participando}`);
      if (r.participando) {
        totalRateio += parseFloat(r.valor_cotista);
      }
      console.log('');
    });

    console.log('═'.repeat(50));
    console.log(`   Total do Orçamento: R$ ${o.valor_total}`);
    console.log(`   Total do Rateio: R$ ${totalRateio.toFixed(2)}`);
    console.log(`   Diferença: R$ ${(totalRateio - parseFloat(o.valor_total)).toFixed(2)}`);
    console.log('═'.repeat(50));

    // 3. Simular a query do preview
    console.log('\n🔎 SIMULANDO QUERY DO PREVIEW:\n');
    const preview = await pool.query(`
      SELECT
        a."Gropo_letra" as grupo_letra,
        SUM(r.valor_cotista) as valor_grupo,
        COUNT(*) as qtd_cotistas
      FROM orcamento_rateio r
      JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      WHERE r.id_orcamento = $1
        AND r.participando = true
      GROUP BY a."Gropo_letra"
      ORDER BY a."Gropo_letra"
    `, [o.id_orcamento]);

    preview.rows.forEach(p => {
      console.log(`   Grupo ${p.grupo_letra}:`);
      console.log(`      Soma dos valores: R$ ${p.valor_grupo}`);
      console.log(`      Qtd cotistas: ${p.qtd_cotistas}`);
      console.log('');
    });

    if (preview.rows.length > 0) {
      const totalPreview = preview.rows.reduce((sum, p) => sum + parseFloat(p.valor_grupo), 0);
      console.log(`   🔢 Total mostrado no preview: R$ ${totalPreview.toFixed(2)}`);
      console.log(`   💰 Total do orçamento: R$ ${o.valor_total}`);

      if (totalPreview > parseFloat(o.valor_total)) {
        console.log(`   ❌ ERRO: Preview mostra R$ ${(totalPreview - parseFloat(o.valor_total)).toFixed(2)} A MAIS!`);
      }
    }

    await pool.end();
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
