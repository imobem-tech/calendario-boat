// ============================================================
// migrar_status_concluido.js — V.2610261238
// Migra orçamentos APROVADO com cobrança para CONCLUIDO
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
    console.log('\n🔄 MIGRAÇÃO DE STATUS\n');
    console.log('═'.repeat(60));

    // 1. Verificar quantos precisam ser migrados
    const verificacao = await pool.query(`
      SELECT
        id_orcamento,
        numero,
        descricao,
        status,
        id_cobranca
      FROM orcamento_servico
      WHERE status = 'APROVADO'
        AND id_cobranca IS NOT NULL
        AND id_cobranca > 0
    `);

    console.log(`\n📊 ORÇAMENTOS A MIGRAR: ${verificacao.rows.length}\n`);

    if (verificacao.rows.length === 0) {
      console.log('✅ Nenhum orçamento precisa ser migrado!\n');
      await pool.end();
      return;
    }

    // Listar os que serão migrados
    verificacao.rows.forEach((orc, idx) => {
      console.log(`${idx + 1}. ID: ${orc.id_orcamento} | ${orc.numero} | CR: ${orc.id_cobranca}`);
    });

    console.log('\n' + '─'.repeat(60));
    console.log('\n🔄 EXECUTANDO MIGRAÇÃO...\n');

    // 2. Atualizar status
    const resultado = await pool.query(`
      UPDATE orcamento_servico
      SET status = 'CONCLUIDO'
      WHERE status = 'APROVADO'
        AND id_cobranca IS NOT NULL
        AND id_cobranca > 0
    `);

    console.log(`✅ ${resultado.rowCount} orçamento(s) atualizado(s)!`);
    console.log(`   Status: APROVADO → CONCLUIDO\n`);

    // 3. Verificar resultado
    const verificacaoFinal = await pool.query(`
      SELECT COUNT(*) as total
      FROM orcamento_servico
      WHERE status = 'APROVADO'
        AND id_cobranca IS NOT NULL
        AND id_cobranca > 0
    `);

    if (parseInt(verificacaoFinal.rows[0].total) === 0) {
      console.log('✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
    } else {
      console.log('⚠️  Ainda existem orçamentos pendentes.\n');
    }

    console.log('═'.repeat(60));
    console.log('\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
