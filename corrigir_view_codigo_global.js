// ============================================================
// corrigir_view_codigo_global.js — V.2610261342
// Corrige VIEW para usar sequência GLOBAL de códigos
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n🔧 CORRIGINDO VIEW - SEQUÊNCIA GLOBAL\n');
    console.log('═'.repeat(80));

    // 1. Verificar situação atual
    console.log('\n📊 SITUAÇÃO ATUAL:\n');

    const maxGeral = await pool.query(`
      SELECT MAX("Codigo") as max_codigo
      FROM "Contas_Receber"
    `);

    const viewAtual = await pool.query(`
      SELECT proximo_codigo
      FROM vw_proximo_codigo
    `);

    console.log(`   MAX GERAL (todas empresas): ${maxGeral.rows[0].max_codigo}`);
    console.log(`   VIEW atual retorna: ${viewAtual.rows[0].proximo_codigo}`);
    console.log(`   ❌ DIFERENÇA: ${maxGeral.rows[0].max_codigo - viewAtual.rows[0].proximo_codigo + 1} códigos`);

    // 2. Contar duplicados
    const duplicados = await pool.query(`
      SELECT COUNT(*) as total
      FROM (
        SELECT "Codigo"
        FROM "Contas_Receber"
        GROUP BY "Codigo"
        HAVING COUNT(*) > 1
      ) t
    `);

    console.log(`\n⚠️  Códigos duplicados existentes: ${duplicados.rows[0].total}`);

    // 3. Recriar VIEW
    console.log('\n\n🔨 RECRIANDO VIEW...\n');

    console.log('   1. Removendo VIEW antiga...');
    await pool.query('DROP VIEW IF EXISTS vw_proximo_codigo');
    console.log('      ✅ Removida');

    console.log('\n   2. Criando VIEW GLOBAL (sem filtro de empresa)...');
    await pool.query(`
      CREATE VIEW vw_proximo_codigo AS
      SELECT COALESCE(MAX("Codigo"), 0) + 1 as proximo_codigo
      FROM "Contas_Receber"
    `);
    console.log('      ✅ Criada');

    // 4. Testar nova VIEW
    console.log('\n\n🧪 TESTANDO VIEW NOVA:\n');

    const viewNova = await pool.query(`
      SELECT proximo_codigo
      FROM vw_proximo_codigo
    `);

    console.log(`   Próximo código: ${viewNova.rows[0].proximo_codigo}`);
    console.log(`   Esperado: ${maxGeral.rows[0].max_codigo + 1}`);

    if (viewNova.rows[0].proximo_codigo === maxGeral.rows[0].max_codigo + 1) {
      console.log('   ✅ CORRETO!');
    } else {
      console.log('   ❌ ERRO!');
    }

    // 5. Mostrar duplicados para análise
    if (duplicados.rows[0].total > 0) {
      console.log('\n\n⚠️  DUPLICADOS EXISTENTES (primeiros 20):\n');

      const listaDuplicados = await pool.query(`
        SELECT
          "Codigo",
          STRING_AGG("Empresa"::text || ':ID=' || "ID"::text, ', ' ORDER BY "Empresa") as detalhes,
          COUNT(*) as qtd
        FROM "Contas_Receber"
        GROUP BY "Codigo"
        HAVING COUNT(*) > 1
        ORDER BY "Codigo" DESC
        LIMIT 20
      `);

      listaDuplicados.rows.forEach(d => {
        console.log(`   Código ${d.Codigo} (${d.qtd}x): ${d.detalhes}`);
      });

      console.log('\n   ⚠️  AÇÃO NECESSÁRIA:');
      console.log('   Esses duplicados precisam ser corrigidos manualmente!');
      console.log('   Sugestão: Renumerar os registros mais antigos.');
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ VIEW CORRIGIDA!\n');
    console.log('📋 RESUMO:');
    console.log(`   • VIEW agora usa sequência GLOBAL`);
    console.log(`   • Próximo código: ${viewNova.rows[0].proximo_codigo}`);
    console.log(`   • Duplicados existentes: ${duplicados.rows[0].total}`);
    console.log('\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
