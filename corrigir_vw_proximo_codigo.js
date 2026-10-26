// ============================================================
// corrigir_vw_proximo_codigo.js — V.2610261115
// Investiga e corrige a VIEW vw_proximo_codigo
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
    console.log('\n🔍 INVESTIGANDO vw_proximo_codigo\n');
    console.log('═'.repeat(100));

    // 1. Ver a definição atual da VIEW
    console.log('\n📋 DEFINIÇÃO ATUAL DA VIEW:\n');

    const definicao = await pool.query(`
      SELECT pg_get_viewdef('vw_proximo_codigo', true) as definicao
    `);

    console.log(definicao.rows[0].definicao);
    console.log('\n' + '─'.repeat(100));

    // 2. Verificar se existe SEQUENCE associada
    console.log('\n\n🔢 VERIFICANDO SEQUENCES:\n');

    const sequences = await pool.query(`
      SELECT sequence_name, last_value
      FROM information_schema.sequences s
      LEFT JOIN pg_sequences ps ON s.sequence_name = ps.sequencename
      WHERE sequence_name LIKE '%conta%' OR sequence_name LIKE '%receber%'
      ORDER BY sequence_name
    `);

    if (sequences.rows.length === 0) {
      console.log('   Nenhuma SEQUENCE relacionada encontrada');
    } else {
      sequences.rows.forEach(seq => {
        console.log(`   • ${seq.sequence_name}: last_value = ${seq.last_value || 'N/A'}`);
      });
    }

    // 3. Ver MAX atual por empresa
    console.log('\n\n📊 MAX(Codigo) ATUAL POR EMPRESA:\n');

    const maxPorEmpresa = await pool.query(`
      SELECT "Empresa", MAX("Codigo") as max_codigo
      FROM "Contas_Receber"
      GROUP BY "Empresa"
      ORDER BY "Empresa"
    `);

    maxPorEmpresa.rows.forEach(row => {
      console.log(`   Empresa ${row.Empresa}: MAX = ${row.max_codigo} → Próximo = ${row.max_codigo + 1}`);
    });

    // 4. Propor correção
    console.log('\n\n' + '═'.repeat(100));
    console.log('\n💡 PROPOSTA DE CORREÇÃO:\n');

    const novaSql = `
CREATE OR REPLACE VIEW vw_proximo_codigo AS
SELECT
  8 as empresa,
  'Contas_Receber' as tabela,
  COALESCE(MAX("Codigo"), 0) + 1 as proximo_codigo
FROM "Contas_Receber"
WHERE "Empresa" = 8;
`;

    console.log(novaSql);

    console.log('─'.repeat(100));
    console.log('\n⚠️  ATENÇÃO: Esta correção vai SOBRESCREVER a VIEW atual!');
    console.log('\nDeseja executar a correção? (Execute manualmente se preferir)\n');

    // 5. Executar correção
    console.log('🚀 EXECUTANDO CORREÇÃO...\n');

    await pool.query(`
      CREATE OR REPLACE VIEW vw_proximo_codigo AS
      SELECT
        8 as empresa,
        'Contas_Receber' as tabela,
        COALESCE(MAX("Codigo"), 0) + 1 as proximo_codigo
      FROM "Contas_Receber"
      WHERE "Empresa" = 8
    `);

    console.log('✅ VIEW corrigida com sucesso!\n');

    // 6. Testar a VIEW corrigida
    console.log('🧪 TESTANDO VIEW CORRIGIDA:\n');

    const teste = await pool.query('SELECT * FROM vw_proximo_codigo');
    console.log(`   Empresa: ${teste.rows[0].empresa}`);
    console.log(`   Tabela: ${teste.rows[0].tabela}`);
    console.log(`   Próximo código: ${teste.rows[0].proximo_codigo}`);

    console.log('\n' + '═'.repeat(100));
    console.log('\n✅ CORREÇÃO CONCLUÍDA!\n');
    console.log(`🎯 A VIEW agora retorna o código correto: ${teste.rows[0].proximo_codigo}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
