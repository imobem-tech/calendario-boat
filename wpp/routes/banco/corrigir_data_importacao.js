// ============================================================
// corrigir_data_importacao.js — V.2609142015
// CORRIGIR DATA DE IMPORTAÇÃO PARA DATA DA TRANSAÇÃO + 00:01
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function corrigir() {
  try {
    console.log('\n🔧 CORRIGINDO DATA DE IMPORTAÇÃO...\n');
    console.log('='.repeat(80) + '\n');

    // Buscar registros ANTES da correção
    const antes = await pool.query(`
      SELECT id, data, importado_em
      FROM bank_extratos
      WHERE tipo_importacao = 'OFX'
        AND empresa = 'ALLMAX'
        AND banco = 'Asaas'
      ORDER BY id
      LIMIT 5
    `);

    console.log('📊 ANTES DA CORREÇÃO (primeiros 5 registros):\n');
    antes.rows.forEach(r => {
      console.log(`  ID ${r.id}:`);
      console.log(`    data: ${r.data.toISOString().split('T')[0]}`);
      console.log(`    importado_em: ${r.importado_em.toISOString()}\n`);
    });

    console.log('='.repeat(80) + '\n');

    // Fazer UPDATE
    console.log('⚙️  EXECUTANDO UPDATE...\n');

    const result = await pool.query(`
      UPDATE bank_extratos
      SET importado_em = data + TIME '00:01:00'
      WHERE tipo_importacao = 'OFX'
        AND empresa = 'ALLMAX'
        AND banco = 'Asaas'
    `);

    console.log(`✅ ${result.rowCount} registros atualizados!\n`);
    console.log('='.repeat(80) + '\n');

    // Buscar registros DEPOIS da correção
    const depois = await pool.query(`
      SELECT id, data, importado_em
      FROM bank_extratos
      WHERE tipo_importacao = 'OFX'
        AND empresa = 'ALLMAX'
        AND banco = 'Asaas'
      ORDER BY id
      LIMIT 5
    `);

    console.log('📊 DEPOIS DA CORREÇÃO (primeiros 5 registros):\n');
    depois.rows.forEach(r => {
      const dataF = r.data.toISOString().split('T')[0];
      const impF = r.importado_em.toISOString();
      console.log(`  ID ${r.id}:`);
      console.log(`    data: ${dataF}`);
      console.log(`    importado_em: ${impF}`);
      console.log(`    ✅ Batendo? ${impF.startsWith(dataF + 'T00:01') ? 'SIM' : 'NÃO'}\n`);
    });

    console.log('='.repeat(80) + '\n');

    // Verificação final
    const verificacao = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN DATE(importado_em) = data THEN 1 END) as corretos
      FROM bank_extratos
      WHERE tipo_importacao = 'OFX'
        AND empresa = 'ALLMAX'
        AND banco = 'Asaas'
    `);

    const { total, corretos } = verificacao.rows[0];
    console.log('🔍 VERIFICAÇÃO FINAL:\n');
    console.log(`  Total de registros OFX: ${total}`);
    console.log(`  Com data de importação correta: ${corretos}`);
    console.log(`  Taxa de sucesso: ${(corretos/total*100).toFixed(1)}%\n`);

    if (parseInt(corretos) === parseInt(total)) {
      console.log('  🎉 PERFEITO! Todos os registros foram corrigidos!\n');
    } else {
      console.log(`  ⚠️  Atenção: ${parseInt(total) - parseInt(corretos)} registros não foram corrigidos.\n`);
    }

    console.log('='.repeat(80) + '\n');
    console.log('✅ CORREÇÃO CONCLUÍDA!\n');

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

corrigir();
