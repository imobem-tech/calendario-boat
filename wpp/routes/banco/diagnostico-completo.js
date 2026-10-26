// ============================================================
// diagnostico-completo.js — V.2610011220
// DIAGNÓSTICO COMPLETO DO PROBLEMA
//
// Analisa:
// - Distribuição atual de status
// - Registros sem classificação
// - Anomalias (PENDENTE com classificação, OK sem classificação, etc)
// - Comparação temporal
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function diagnosticoCompleto() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏥 DIAGNÓSTICO COMPLETO - bank_extratos');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  try {
    // 1. VISÃO GERAL
    console.log('📊 1. VISÃO GERAL:');
    console.log('');

    const { rows: visaoGeral } = await pool.query(`
      SELECT
        status,
        COUNT(*) as total,
        COUNT(CASE WHEN classificacao IS NOT NULL AND classificacao != '' THEN 1 END) as com_classif,
        COUNT(CASE WHEN classificacao IS NULL OR classificacao = '' THEN 1 END) as sem_classif,
        COUNT(CASE WHEN classificacao_manual = true THEN 1 END) as manual,
        SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) as entradas,
        SUM(CASE WHEN valor < 0 THEN valor ELSE 0 END) as saidas
      FROM bank_extratos
      GROUP BY status
      ORDER BY status
    `);

    console.log('┌────────────┬────────┬─────────────┬──────────────┬────────┬─────────────────┬─────────────────┐');
    console.log('│   Status   │ Total  │ C/Classif   │ S/Classif    │ Manual │   Entradas R$   │    Saídas R$    │');
    console.log('├────────────┼────────┼─────────────┼──────────────┼────────┼─────────────────┼─────────────────┤');

    visaoGeral.forEach(v => {
      const status = (v.status || 'NULL').padEnd(10);
      const total = String(v.total).padStart(6);
      const comClassif = String(v.com_classif).padStart(11);
      const semClassif = String(v.sem_classif).padStart(12);
      const manual = String(v.manual).padStart(6);
      const entradas = `R$ ${parseFloat(v.entradas || 0).toFixed(2)}`.padStart(15);
      const saidas = `R$ ${parseFloat(v.saidas || 0).toFixed(2)}`.padStart(15);

      console.log(`│ ${status} │ ${total} │ ${comClassif} │ ${semClassif} │ ${manual} │ ${entradas} │ ${saidas} │`);
    });

    console.log('└────────────┴────────┴─────────────┴──────────────┴────────┴─────────────────┴─────────────────┘');
    console.log('');

    // 2. ANOMALIAS DETECTADAS
    console.log('🔍 2. ANOMALIAS DETECTADAS:');
    console.log('');

    // 2.1 - PENDENTE com classificação
    const { rows: [{ count: pendComClass }] } = await pool.query(`
      SELECT COUNT(*) as count
      FROM bank_extratos
      WHERE status = 'PENDENTE'
        AND classificacao IS NOT NULL
        AND classificacao != ''
    `);

    if (parseInt(pendComClass) > 0) {
      console.log(`   ⚠️ ${pendComClass} registros PENDENTES têm classificação (anormal!)`);
    } else {
      console.log('   ✅ Nenhum registro PENDENTE com classificação');
    }

    // 2.2 - OK sem classificação
    const { rows: [{ count: okSemClass }] } = await pool.query(`
      SELECT COUNT(*) as count
      FROM bank_extratos
      WHERE status = 'OK'
        AND (classificacao IS NULL OR classificacao = '')
    `);

    if (parseInt(okSemClass) > 0) {
      console.log(`   ⚠️ ${okSemClass} registros OK estão SEM classificação (anormal!)`);
    } else {
      console.log('   ✅ Todos os registros OK têm classificação');
    }

    // 2.3 - recibos_urls preenchido mas vazio
    const { rows: [{ count: recibosVazios }] } = await pool.query(`
      SELECT COUNT(*) as count
      FROM bank_extratos
      WHERE recibos_urls IS NOT NULL
        AND jsonb_array_length(recibos_urls) = 0
    `);

    if (parseInt(recibosVazios) > 0) {
      console.log(`   ℹ️ ${recibosVazios} registros têm recibos_urls = [] (array vazio)`);
    }

    console.log('');

    // 3. LINHA DO TEMPO (últimos 7 dias)
    console.log('📅 3. LINHA DO TEMPO (últimos 7 dias):');
    console.log('');

    const { rows: timeline } = await pool.query(`
      SELECT
        DATE(importado_em AT TIME ZONE 'America/Sao_Paulo') as dia,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'OK' THEN 1 END) as ok,
        COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendente,
        COUNT(CASE WHEN classificacao IS NOT NULL AND classificacao != '' THEN 1 END) as com_classif
      FROM bank_extratos
      WHERE importado_em >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(importado_em AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY dia DESC
    `);

    console.log('┌────────────────┬────────┬────────┬──────────┬─────────────┐');
    console.log('│      Data      │ Total  │   OK   │ PENDENTE │ C/Classif   │');
    console.log('├────────────────┼────────┼────────┼──────────┼─────────────┤');

    timeline.forEach(t => {
      const dia = t.dia.toLocaleDateString('pt-BR').padEnd(14);
      const total = String(t.total).padStart(6);
      const ok = String(t.ok).padStart(6);
      const pendente = String(t.pendente).padStart(8);
      const comClassif = String(t.com_classif).padStart(11);

      console.log(`│ ${dia} │ ${total} │ ${ok} │ ${pendente} │ ${comClassif} │`);
    });

    console.log('└────────────────┴────────┴────────┴──────────┴─────────────┘');
    console.log('');

    // 4. TOP 10 PENDENTES SEM CLASSIFICAÇÃO
    console.log('🚨 4. TOP 10 REGISTROS PENDENTES SEM CLASSIFICAÇÃO:');
    console.log('');

    const { rows: top10Pendentes } = await pool.query(`
      SELECT
        id,
        empresa,
        data,
        descricao_original,
        valor,
        status,
        classificacao,
        importado_em AT TIME ZONE 'America/Sao_Paulo' as quando_importou
      FROM bank_extratos
      WHERE status = 'PENDENTE'
        AND (classificacao IS NULL OR classificacao = '')
      ORDER BY data DESC, valor DESC
      LIMIT 10
    `);

    if (top10Pendentes.length === 0) {
      console.log('   ✅ Nenhum registro PENDENTE sem classificação!');
    } else {
      top10Pendentes.forEach((r, i) => {
        console.log(`   ${i + 1}. ID ${r.id} | ${r.empresa} | ${r.data.toLocaleDateString('pt-BR')}`);
        console.log(`      Valor: R$ ${parseFloat(r.valor).toFixed(2)}`);
        console.log(`      Descrição: ${r.descricao_original.substring(0, 70)}...`);
        console.log(`      Importado em: ${r.quando_importou.toLocaleString('pt-BR')}`);
        console.log('');
      });
    }

    // 5. ÚLTIMAS AÇÕES NO SISTEMA
    console.log('⏱️ 5. ÚLTIMAS AÇÕES NO SISTEMA:');
    console.log('');

    const { rows: [ultimasAcoes] } = await pool.query(`
      SELECT
        MAX(importado_em AT TIME ZONE 'America/Sao_Paulo') as ultima_importacao,
        MAX(classificado_em AT TIME ZONE 'America/Sao_Paulo') as ultima_classificacao
      FROM bank_extratos
    `);

    console.log(`   Última importação: ${ultimasAcoes.ultima_importacao?.toLocaleString('pt-BR') || 'N/A'}`);
    console.log(`   Última classificação: ${ultimasAcoes.ultima_classificacao?.toLocaleString('pt-BR') || 'N/A'}`);
    console.log('');

    // 6. CONCLUSÃO E RECOMENDAÇÕES
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('💡 CONCLUSÃO E RECOMENDAÇÕES:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    const totalPend = parseInt(visaoGeral.find(v => v.status === 'PENDENTE')?.total || 0);
    const totalOk = parseInt(visaoGeral.find(v => v.status === 'OK')?.total || 0);
    const okSemClassNum = parseInt(okSemClass);
    const pendComClassNum = parseInt(pendComClass);

    if (okSemClassNum > 0) {
      console.log(`⚠️ PROBLEMA: ${okSemClassNum} registros OK sem classificação`);
      console.log('   Recomendação: Executar reclassificação para preencher');
      console.log('');
    }

    if (pendComClassNum > 0) {
      console.log(`⚠️ PROBLEMA: ${pendComClassNum} registros PENDENTES têm classificação`);
      console.log('   Possível causa: Status foi alterado indevidamente');
      console.log('   Recomendação: Restaurar status OK para esses registros');
      console.log('');
    }

    if (totalPend > totalOk * 0.1) {
      console.log(`⚠️ ALERTA: ${totalPend} registros PENDENTES (>${(totalPend/(totalOk+totalPend)*100).toFixed(1)}% do total)`);
      console.log('   Recomendação: Investigar motivo de tantos pendentes');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    await pool.end();

  } catch (err) {
    console.error('❌ Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

diagnosticoCompleto();

// ============================================================
// FIM
// ============================================================
