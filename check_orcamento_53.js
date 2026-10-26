// Verificar orçamento ID 53
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔍 ORÇAMENTO ID 53\n');

    // Buscar orçamento
    const orc = await pool.query(`
      SELECT id_orcamento, numero, valor_total, id_embarcacao as numero_pb
      FROM orcamento_servico
      WHERE id_orcamento = 53
    `);

    if (orc.rows.length === 0) {
      console.log('❌ Orçamento não encontrado');
      await pool.end();
      return;
    }

    const o = orc.rows[0];
    console.log(`Número: ${o.numero}`);
    console.log(`PB: ${o.numero_pb}`);
    console.log(`Total: R$ ${o.valor_total}\n`);

    // QUERY EXATA DO PREVIEW
    console.log('📊 QUERY EXATA DO PREVIEW:\n');
    const preview = await pool.query(`
      SELECT
        a."Gropo_letra" as grupo_letra,
        SUM(r.valor_cotista) as valor_grupo,
        COUNT(*) as qtd_cotistas
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

    console.log('Grupo | Qtd | Valor');
    console.log('------|-----|----------');
    preview.rows.forEach(g => {
      console.log(`${g.grupo_letra.padEnd(5)} | ${String(g.qtd_cotistas).padEnd(3)} | ${g.valor_grupo}`);
    });

    const total = preview.rows.reduce((sum, g) => sum + parseFloat(g.valor_grupo), 0);
    console.log('\n' + '═'.repeat(40));
    console.log(`Total orçamento: R$ ${o.valor_total}`);
    console.log(`Soma grupos:     R$ ${total.toFixed(2)}`);
    console.log(`Diferença:       R$ ${(total - parseFloat(o.valor_total)).toFixed(2)}`);

    if (preview.rows.some(g => g.qtd_cotistas > 1)) {
      console.log('\n⚠️  HÁ GRUPOS COM MÚLTIPLOS REGISTROS!');
      preview.rows.filter(g => g.qtd_cotistas > 1).forEach(g => {
        console.log(`   ${g.grupo_letra}: ${g.qtd_cotistas} registros`);
      });
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await pool.end();
  }
})();
