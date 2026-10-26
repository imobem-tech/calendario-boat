// Verificar registros duplicados no rateio
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔍 INVESTIGANDO ORÇAMENTO ORC-261025152542\n');
    console.log('═'.repeat(70));

    // 1. Dados do orçamento (ID 53 que apareceu nos logs)
    const orc = await pool.query(`
      SELECT id_orcamento, numero, valor_total, status, numero_pb
      FROM orcamento_servico
      WHERE id_orcamento = 53
    `);

    if (orc.rows.length === 0) {
      console.log('❌ Orçamento não encontrado\n');
      await pool.end();
      return;
    }

    const o = orc.rows[0];
    console.log('\n📋 ORÇAMENTO:');
    console.log(`   Número: ${o.numero}`);
    console.log(`   Total: R$ ${o.valor_total}`);
    console.log(`   Status: ${o.status}`);

    // 2. TODOS os registros (participando ou não)
    console.log('\n📊 TODOS OS REGISTROS DE RATEIO:\n');
    const todos = await pool.query(`
      SELECT
        r.id_rateio,
        a."Gropo_letra" as grupo,
        r.valor_cotista,
        r.participando,
        r.id_autorizado,
        c."Cliente_Nome" as nome_cotista
      FROM orcamento_rateio r
      JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      LEFT JOIN "Cliente" c ON c."Codigo" = a."Cod_Pessoa"
      WHERE r.id_orcamento = $1
      ORDER BY a."Gropo_letra", r.id_rateio
    `, [o.id_orcamento]);

    console.log('ID    | Grupo | Valor    | Part. | Nome Cotista');
    console.log('------|-------|----------|-------|---------------------------');
    todos.rows.forEach(r => {
      console.log(
        `${String(r.id_rateio).padEnd(5)} | ` +
        `${(r.grupo || '?').padEnd(5)} | ` +
        `${String(r.valor_cotista).padEnd(8)} | ` +
        `${(r.participando ? 'SIM' : 'NÃO').padEnd(5)} | ` +
        `${(r.nome_cotista || 'sem nome').substring(0, 25)}`
      );
    });

    // 3. Agrupamento por grupo (QUERY EXATA DO PREVIEW)
    console.log('\n📈 QUERY EXATA DO PREVIEW (com LEFT JOIN wpp_grupos_agenda):\n');
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

    console.log('Grupo | Qtd | Valor     | ID WhatsApp        | Nome Grupo');
    console.log('------|-----|-----------|--------------------|--------------------------');
    preview.rows.forEach(g => {
      console.log(
        `${(g.grupo_letra || '?').padEnd(5)} | ` +
        `${String(g.qtd_cotistas).padEnd(3)} | ` +
        `${String(g.valor_grupo).padEnd(9)} | ` +
        `${(g.id_grupo_wpp || 'não cadastrado').toString().padEnd(18)} | ` +
        `${(g.nome_grupo || '').substring(0, 24)}`
      );
    });

    const totalAgrupado = preview.rows.reduce((sum, g) => sum + parseFloat(g.valor_grupo), 0);

    console.log('\n═'.repeat(70));
    console.log(`💰 Total do orçamento: R$ ${o.valor_total}`);
    console.log(`📊 Soma dos grupos:    R$ ${totalAgrupado.toFixed(2)}`);
    console.log(`📉 Diferença:          R$ ${(totalAgrupado - parseFloat(o.valor_total)).toFixed(2)}`);

    if (Math.abs(totalAgrupado - parseFloat(o.valor_total)) > 0.01) {
      console.log('\n❌ PROBLEMA DETECTADO!');

      const duplicados = agrupado.rows.filter(g => g.qtd_registros > 1);
      if (duplicados.length > 0) {
        console.log('\n🚨 GRUPOS COM REGISTROS DUPLICADOS:');
        duplicados.forEach(g => {
          console.log(`   ${g.grupo}: ${g.qtd_registros} registros (${g.valores_somados})`);
        });
      }
    } else {
      console.log('\n✅ Valores conferem!');
    }
    console.log('═'.repeat(70) + '\n');

    await pool.end();
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
