// ============================================================
// SCRIPT DE LIMPEZA DE TABELAS DE ORÇAMENTOS
// V.2610250003 - IDs começam em 50
// ============================================================
//
// ⚠️ ATENÇÃO: Este script irá DELETAR TODOS os dados de teste
// das tabelas de orçamentos. Use apenas em ambiente de desenvolvimento!
//
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Definir a ordem correta de limpeza (respeitando foreign keys)
const ORDEM_LIMPEZA = [
  'orcamento_conta_receber',  // 1º - depende de rateio
  'orcamento_log',            // 2º - depende de servico
  'orcamento_anexo',          // 3º - depende de servico
  'orcamento_rateio',         // 4º - depende de servico
  'orcamento_item',           // 5º - depende de servico
  'orcamento_servico'         // 6º - tabela principal (última)
];

async function verificarRegistros() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  📊 DADOS QUE SERÃO DELETADOS                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let totalGeral = 0;

  for (const tabela of ORDEM_LIMPEZA) {
    const result = await pool.query(`SELECT COUNT(*) as total FROM "${tabela}"`);
    const total = parseInt(result.rows[0].total);
    totalGeral += total;

    const status = total > 0 ? '🗑️' : '✓';
    console.log(`   ${status} ${tabela.padEnd(30)} → ${total.toString().padStart(5)} registro(s)`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`   TOTAL DE REGISTROS A DELETAR: ${totalGeral}\n`);

  return totalGeral;
}

async function limparTabelas() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  🧹 EXECUTANDO LIMPEZA                                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let totalDeletado = 0;

  for (const tabela of ORDEM_LIMPEZA) {
    try {
      const result = await pool.query(`DELETE FROM "${tabela}"`);
      const deletados = result.rowCount;
      totalDeletado += deletados;

      console.log(`   ✅ ${tabela.padEnd(30)} → ${deletados.toString().padStart(5)} registro(s) deletado(s)`);
    } catch (error) {
      console.log(`   ❌ ${tabela.padEnd(30)} → ERRO: ${error.message}`);
      throw error;
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`   ✅ TOTAL DELETADO: ${totalDeletado} registro(s)\n`);

  return totalDeletado;
}

async function resetarSequences() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  🔄 RESETANDO SEQUENCES (IDs começarão em 50)              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const sequences = [
    'orcamento_servico_id_orcamento_seq',
    'orcamento_item_id_item_seq',
    'orcamento_rateio_id_rateio_seq',
    'orcamento_conta_receber_id_cr_seq',
    'orcamento_anexo_id_anexo_seq',
    'orcamento_log_id_log_seq'
  ];

  for (const seq of sequences) {
    try {
      await pool.query(`ALTER SEQUENCE "${seq}" RESTART WITH 50`);
      console.log(`   ✅ ${seq.padEnd(40)} → próximo ID: 50`);
    } catch (error) {
      // Se a sequence não existir, apenas ignora
      console.log(`   ⚠️  ${seq.padEnd(40)} → não encontrada`);
    }
  }

  console.log('');
}

// Função principal
(async () => {
  try {
    // 1. Verificar dados antes de deletar
    const total = await verificarRegistros();

    if (total === 0) {
      console.log('✅ Nenhum registro encontrado. Tabelas já estão limpas!\n');
      await pool.end();
      return;
    }

    // 2. Limpar as tabelas
    console.log('⚠️  Iniciando limpeza em 3 segundos...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await limparTabelas();

    // 3. Resetar sequences para começar em 50
    await resetarSequences();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ LIMPEZA CONCLUÍDA COM SUCESSO!                         ║');
    console.log('║                                                            ║');
    console.log('║  • Todos os registros deletados                            ║');
    console.log('║  • Próximos IDs começarão em 50                            ║');
    console.log('║  • Sistema pronto para novos testes                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    await pool.end();
  } catch (error) {
    console.error('\n❌ ERRO NA LIMPEZA:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
})();
