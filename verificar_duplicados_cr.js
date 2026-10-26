// ============================================================
// verificar_duplicados_cr.js — V.2610260951
// Verifica códigos duplicados em Contas_Receber (últimos 60 dias)
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
    console.log('\n🔍 VERIFICANDO DUPLICADOS EM CONTAS_RECEBER');
    console.log('━'.repeat(70));
    console.log('Período: Últimos 60 dias\n');

    // 1. Buscar códigos duplicados
    const duplicados = await pool.query(`
      SELECT
        "Empresa",
        "Codigo",
        COUNT(*) as quantidade,
        STRING_AGG("ID"::TEXT, ', ') as ids,
        MIN("Data_Conta") as primeira_data,
        MAX("Data_Conta") as ultima_data
      FROM "Contas_Receber"
      WHERE "Data_Conta" >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY "Empresa", "Codigo"
      HAVING COUNT(*) > 1
      ORDER BY "Empresa", "Codigo"
    `);

    if (duplicados.rows.length === 0) {
      console.log('✅ NENHUM CÓDIGO DUPLICADO ENCONTRADO!\n');
      console.log('Todos os códigos estão únicos nos últimos 60 dias.\n');
      await pool.end();
      return;
    }

    // 2. Exibir duplicados encontrados
    console.log(`❌ ENCONTRADOS ${duplicados.rows.length} CÓDIGO(S) DUPLICADO(S):\n`);
    console.log('Emp | Código  | Qtd | IDs                        | Primeira    | Última');
    console.log('━'.repeat(70));

    let totalRegistros = 0;

    for (const dup of duplicados.rows) {
      totalRegistros += parseInt(dup.quantidade);

      const empresa = String(dup.Empresa).padEnd(3);
      const codigo = String(dup.Codigo).padEnd(7);
      const qtd = String(dup.quantidade).padEnd(3);
      const ids = dup.ids.padEnd(26);
      const primeira = dup.primeira_data?.toISOString().split('T')[0] || 'N/A';
      const ultima = dup.ultima_data?.toISOString().split('T')[0] || 'N/A';

      console.log(`${empresa} | ${codigo} | ${qtd} | ${ids} | ${primeira} | ${ultima}`);
    }

    console.log('━'.repeat(70));
    console.log(`Total: ${duplicados.rows.length} código(s) duplicado(s)`);
    console.log(`Registros afetados: ${totalRegistros}\n`);

    // 3. Detalhar cada duplicado
    console.log('\n📋 DETALHES DOS DUPLICADOS:\n');

    for (const dup of duplicados.rows) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`EMPRESA ${dup.Empresa} - CÓDIGO ${dup.Codigo} (${dup.quantidade} registros)`);
      console.log('='.repeat(70));

      const detalhes = await pool.query(`
        SELECT
          "ID",
          "Codigo",
          "Empresa",
          "Descrição",
          "Código_Cliente",
          "Data_Conta",
          "Valor",
          "Portador",
          "Centro_Custo"
        FROM "Contas_Receber"
        WHERE "Empresa" = $1 AND "Codigo" = $2
        ORDER BY "ID"
      `, [dup.Empresa, dup.Codigo]);

      console.log('\nID     | Cliente | Data       | Valor    | Portador          | Centro | Descrição');
      console.log('-'.repeat(70));

      for (const reg of detalhes.rows) {
        const id = String(reg.ID).padEnd(6);
        const cliente = String(reg.Código_Cliente || '').padEnd(7);
        const data = reg.Data_Conta?.toISOString().split('T')[0] || 'N/A';
        const valor = parseFloat(reg.Valor || 0).toFixed(2).padStart(8);
        const portador = (reg.Portador || 'N/A').substring(0, 17).padEnd(17);
        const centro = String(reg.Centro_Custo || '').padEnd(6);
        const descricao = (reg.Descrição || '').substring(0, 40);

        console.log(`${id} | ${cliente} | ${data} | ${valor} | ${portador} | ${centro} | ${descricao}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n💡 RECOMENDAÇÃO:');
    console.log('   1. Verificar se são registros legítimos ou duplicação real');
    console.log('   2. Se duplicação real: corrigir códigos dos registros mais recentes');
    console.log('   3. Usar vw_proximo_codigo para evitar futuras duplicações\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
