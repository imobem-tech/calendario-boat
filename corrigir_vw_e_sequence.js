// ============================================================
// corrigir_vw_e_sequence.js — V.2610261120
// Corrige VIEW e SEQUENCE de códigos
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
    console.log('\n🔧 CORREÇÃO DA VIEW E SEQUENCE\n');
    console.log('═'.repeat(100));

    // 1. Problema identificado
    console.log('\n🔍 PROBLEMA IDENTIFICADO:\n');
    console.log('   VIEW atual: SELECT gerar_proximo_codigo_cr() → retorna 58618');
    console.log('   SEQUENCE: contas_receber_codigo_seq = 58618');
    console.log('   MAX real (Empresa 8): 58719');
    console.log('   ❌ Diferença de 101 códigos!\n');

    // 2. Atualizar SEQUENCE
    console.log('─'.repeat(100));
    console.log('\n🔢 PASSO 1: Atualizar SEQUENCE\n');

    const maxEmpresa8 = await pool.query(`
      SELECT MAX("Codigo") as max_codigo
      FROM "Contas_Receber"
      WHERE "Empresa" = 8
    `);

    const novoValor = maxEmpresa8.rows[0].max_codigo;
    console.log(`   MAX atual da Empresa 8: ${novoValor}`);

    await pool.query(`
      SELECT setval('contas_receber_codigo_seq', $1, true)
    `, [novoValor]);

    console.log(`   ✅ SEQUENCE atualizada para: ${novoValor}`);

    // Verificar
    const verificaSeq = await pool.query(`
      SELECT last_value FROM contas_receber_codigo_seq
    `);
    console.log(`   ✅ Verificação: SEQUENCE agora = ${verificaSeq.rows[0].last_value}`);

    // 3. Recriar VIEW (DROP + CREATE)
    console.log('\n\n📋 PASSO 2: Recriar VIEW\n');

    console.log('   Removendo VIEW antiga...');
    await pool.query('DROP VIEW IF EXISTS vw_proximo_codigo');
    console.log('   ✅ VIEW removida');

    console.log('\n   Criando VIEW nova (usando MAX por empresa)...');
    await pool.query(`
      CREATE VIEW vw_proximo_codigo AS
      SELECT COALESCE(MAX("Codigo"), 0) + 1 as proximo_codigo
      FROM "Contas_Receber"
      WHERE "Empresa" = 8
    `);
    console.log('   ✅ VIEW criada');

    // 4. Testar
    console.log('\n\n🧪 PASSO 3: Testar VIEW corrigida\n');

    const teste = await pool.query('SELECT * FROM vw_proximo_codigo');
    console.log(`   Próximo código retornado: ${teste.rows[0].proximo_codigo}`);

    const esperado = novoValor + 1;
    if (teste.rows[0].proximo_codigo === esperado) {
      console.log(`   ✅ CORRETO! (esperado: ${esperado})`);
    } else {
      console.log(`   ⚠️  Diferença! (esperado: ${esperado})`);
    }

    console.log('\n' + '═'.repeat(100));
    console.log('\n✅ CORREÇÃO CONCLUÍDA!\n');
    console.log('📋 Resumo:');
    console.log(`   • SEQUENCE atualizada: 58618 → ${novoValor}`);
    console.log(`   • VIEW recriada: agora retorna ${teste.rows[0].proximo_codigo}`);
    console.log(`   • Próximo CR criado terá código: ${teste.rows[0].proximo_codigo}\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
