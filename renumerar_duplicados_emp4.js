// ============================================================
// renumerar_duplicados_emp4.js — V.2610261345
// Renumera códigos duplicados da Empresa 4
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
    console.log('\n🔧 RENUMERANDO DUPLICADOS DA EMPRESA 4\n');
    console.log('═'.repeat(100));

    // 1. Buscar MAX atual para começar a renumeração
    const maxResult = await pool.query(`
      SELECT MAX("Codigo") as max_codigo
      FROM "Contas_Receber"
    `);

    const novoCodigoInicial = maxResult.rows[0].max_codigo + 1;
    console.log(`\n📊 MAX ATUAL: ${maxResult.rows[0].max_codigo}`);
    console.log(`📊 NOVO INÍCIO: ${novoCodigoInicial}\n`);

    // 2. Buscar os duplicados da Empresa 4 (ordenados por código)
    const duplicados = await pool.query(`
      SELECT
        cr4."ID",
        cr4."Codigo",
        cr4."Descrição"
      FROM "Contas_Receber" cr4
      WHERE cr4."Empresa" = 4
        AND EXISTS (
          SELECT 1 FROM "Contas_Receber" cr_outras
          WHERE cr4."Codigo" = cr_outras."Codigo"
            AND cr4."Empresa" != cr_outras."Empresa"
        )
      ORDER BY cr4."Codigo" ASC
    `);

    console.log(`✅ Total a renumerar: ${duplicados.rows.length}\n`);

    if (duplicados.rows.length === 0) {
      console.log('✅ Nenhum duplicado encontrado!\n');
      await pool.end();
      return;
    }

    // 3. Preparar renumeração
    console.log('📋 PLANO DE RENUMERAÇÃO:\n');
    console.log('┌─────────┬────────────┬────────────┬────────────────────────────────────────┐');
    console.log('│ ID      │ Código OLD │ Código NEW │ Descrição                              │');
    console.log('├─────────┼────────────┼────────────┼────────────────────────────────────────┤');

    const renumeracoes = [];
    duplicados.rows.forEach((d, index) => {
      const novoCodigo = novoCodigoInicial + index;
      renumeracoes.push({
        id: d.ID,
        codigoAntigo: d.Codigo,
        codigoNovo: novoCodigo,
        descricao: d.Descrição
      });

      const id = String(d.ID).padEnd(7);
      const old_code = String(d.Codigo).padEnd(10);
      const new_code = String(novoCodigo).padEnd(10);
      const desc = String(d.Descrição || '').substring(0, 38).padEnd(38);

      console.log(`│ ${id} │ ${old_code} │ ${new_code} │ ${desc} │`);
    });

    console.log('└─────────┴────────────┴────────────┴────────────────────────────────────────┘');

    // 4. Executar renumeração
    console.log('\n\n🔨 EXECUTANDO RENUMERAÇÃO...\n');

    let sucessos = 0;
    let erros = 0;

    for (const r of renumeracoes) {
      try {
        await pool.query(`
          UPDATE "Contas_Receber"
          SET "Codigo" = $1,
              "Documento" = $2
          WHERE "ID" = $3
        `, [r.codigoNovo, String(r.codigoNovo), r.id]);

        console.log(`   ✅ ID ${r.id}: ${r.codigoAntigo} → ${r.codigoNovo}`);
        sucessos++;

      } catch (error) {
        console.log(`   ❌ ID ${r.id}: ERRO - ${error.message}`);
        erros++;
      }
    }

    console.log('\n' + '─'.repeat(100));
    console.log(`\n📊 RESULTADO:`);
    console.log(`   ✅ Sucesso: ${sucessos}`);
    console.log(`   ❌ Erros: ${erros}`);

    // 5. Verificar duplicados remanescentes
    console.log('\n\n🔍 VERIFICANDO DUPLICADOS REMANESCENTES...\n');

    const verificacao = await pool.query(`
      SELECT COUNT(*) as total
      FROM (
        SELECT "Codigo"
        FROM "Contas_Receber"
        GROUP BY "Codigo"
        HAVING COUNT(*) > 1
      ) t
    `);

    const duplicadosRestantes = parseInt(verificacao.rows[0].total);
    console.log(`   Códigos duplicados restantes: ${duplicadosRestantes}`);

    if (duplicadosRestantes === 0) {
      console.log('   ✅ NENHUM DUPLICADO! Renumeração completa!\n');
    } else {
      console.log('   ⚠️  Ainda existem duplicados (outras empresas)\n');
    }

    // 6. Verificar VIEW
    const viewNova = await pool.query(`
      SELECT proximo_codigo
      FROM vw_proximo_codigo
    `);

    console.log(`\n📋 VIEW vw_proximo_codigo agora retorna: ${viewNova.rows[0].proximo_codigo}`);

    console.log('\n' + '═'.repeat(100));
    console.log('\n✅ RENUMERAÇÃO CONCLUÍDA!\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
