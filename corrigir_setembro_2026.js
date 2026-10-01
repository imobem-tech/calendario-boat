// V.2610011255
// Script para corrigir mês 09/2026
// Uso: node corrigir_setembro_2026.js [acao]
//
// Ações disponíveis:
//   auditar         - Verifica problemas (padrão)
//   limpar-dup      - Remove duplicatas
//   corrigir-status - Corrige status inconsistentes
//   resetar         - PERIGO: Remove tudo do mês

import fetch from 'node-fetch';

const MES = '2026-09';
const EMPRESA = 'ALLMAX';
const BASE_URL = 'http://localhost:3000/api/banco/corrigir-mes';

const acao = process.argv[2] || 'auditar';

async function auditar() {
  console.log(`\n🔍 AUDITANDO MÊS ${MES} - ${EMPRESA}\n`);

  const response = await fetch(`${BASE_URL}/auditar?mes=${MES}&empresa=${EMPRESA}`);
  const data = await response.json();

  if (!data.sucesso) {
    console.error('❌ Erro:', data.erro);
    return;
  }

  const stats = data.estatisticas;
  const prob = data.problemas;

  console.log('📊 ESTATÍSTICAS:');
  console.log(`   Total de registros: ${stats.total}`);
  console.log(`   ✅ OK: ${stats.ok}`);
  console.log(`   ⚠️  PENDENTE: ${stats.pendente}`);
  console.log(`   ❓ Sem status: ${stats.sem_status}`);
  console.log(`   📋 Sem classificação: ${stats.sem_classificacao}`);
  console.log(`   ✋ Manuais: ${stats.manual}`);
  console.log(`   📎 Com recibos: ${stats.com_recibos}\n`);

  console.log(`💰 VALORES:`);
  console.log(`   Créditos: R$ ${parseFloat(stats.total_credito).toFixed(2)}`);
  console.log(`   Débitos: R$ ${parseFloat(stats.total_debito).toFixed(2)}\n`);

  console.log('🚨 PROBLEMAS ENCONTRADOS:');
  console.log(`   Duplicatas por ID: ${prob.duplicatas_fitid.total} (${prob.duplicatas_fitid.registros_afetados} registros)`);
  console.log(`   Duplicatas por descrição: ${prob.duplicatas_descricao.total} (${prob.duplicatas_descricao.registros_afetados} registros)`);
  console.log(`   Registros problemáticos: ${prob.registros_problematicos.total}\n`);

  if (prob.duplicatas_fitid.total > 0) {
    console.log('📋 DUPLICATAS POR ID (primeiras 5):');
    prob.duplicatas_fitid.lista.slice(0, 5).forEach(d => {
      console.log(`   • Fitid ${d.fitid}: ${d.quantidade} registros`);
      console.log(`     IDs: ${d.ids.join(', ')}`);
      console.log(`     ${d.tem_recibo ? '📎 TEM RECIBO' : '❌ Sem recibo'}\n`);
    });
  }

  if (prob.registros_problematicos.total > 0) {
    console.log('⚠️  REGISTROS PROBLEMÁTICOS (primeiros 5):');
    prob.registros_problematicos.lista.slice(0, 5).forEach(r => {
      console.log(`   • ID ${r.id} - ${r.data.split('T')[0]}`);
      console.log(`     ${r.descricao.substring(0, 60)}...`);
      console.log(`     Problema: ${r.problema}\n`);
    });
  }

  console.log('\n💡 PRÓXIMOS PASSOS:');
  if (prob.duplicatas_fitid.total > 0) {
    console.log('   node corrigir_setembro_2026.js limpar-dup');
  }
  if (stats.sem_status > 0 || stats.pendente > 0) {
    console.log('   node corrigir_setembro_2026.js corrigir-status');
  }
  console.log('');
}

async function limparDuplicatas() {
  console.log(`\n🧹 LIMPANDO DUPLICATAS DO MÊS ${MES}\n`);

  console.log('Critério: Manter registro COM RECIBO > MANUAL > MAIS RECENTE\n');

  const response = await fetch(`${BASE_URL}/limpar-duplicatas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mes: MES, empresa: EMPRESA, criterio: 'com_recibo' })
  });

  const data = await response.json();

  if (!data.sucesso) {
    console.error('❌ Erro:', data.erro);
    return;
  }

  console.log('✅ CONCLUÍDO!');
  console.log(`   Duplicatas processadas: ${data.duplicatas_processadas}`);
  console.log(`   Registros removidos: ${data.registros_removidos}`);
  console.log(`   Registros mantidos: ${data.registros_mantidos}\n`);
}

async function corrigirStatus() {
  console.log(`\n🔧 CORRIGINDO STATUS DO MÊS ${MES}\n`);

  const response = await fetch(`${BASE_URL}/resetar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mes: MES, empresa: EMPRESA, acao: 'corrigir_status' })
  });

  const data = await response.json();

  if (!data.sucesso) {
    console.error('❌ Erro:', data.erro);
    return;
  }

  console.log('✅ CONCLUÍDO!');
  console.log(`   Registros atualizados: ${data.registros_atualizados}\n`);
}

async function resetarMes() {
  console.log(`\n⚠️  RESETAR MÊS ${MES} - ISSO VAI DELETAR TUDO!\n`);
  console.log('Pressione Ctrl+C para cancelar ou Enter para continuar...\n');

  // Aguardar confirmação
  process.stdin.once('data', async () => {
    const response = await fetch(`${BASE_URL}/resetar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes: MES, empresa: EMPRESA, acao: 'limpar_tudo' })
    });

    const data = await response.json();

    if (!data.sucesso) {
      console.error('❌ Erro:', data.erro);
      process.exit(1);
    }

    console.log('✅ MÊS RESETADO!');
    console.log(`   Registros removidos: ${data.registros_removidos}`);
    console.log(`\n💡 Agora reimporte o arquivo OFX do mês ${MES}\n`);
    process.exit(0);
  });
}

// Executar ação
try {
  switch (acao) {
    case 'auditar':
      await auditar();
      break;
    case 'limpar-dup':
      await limparDuplicatas();
      break;
    case 'corrigir-status':
      await corrigirStatus();
      break;
    case 'resetar':
      await resetarMes();
      return; // Não faz exit aqui pois está aguardando input
    default:
      console.error(`\n❌ Ação inválida: ${acao}`);
      console.log('\nAções disponíveis:');
      console.log('  auditar         - Verifica problemas');
      console.log('  limpar-dup      - Remove duplicatas');
      console.log('  corrigir-status - Corrige status');
      console.log('  resetar         - PERIGO: Remove tudo\n');
      process.exit(1);
  }
} catch (err) {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
}
