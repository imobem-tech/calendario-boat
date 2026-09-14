// ============================================================
// EXECUTAR ATUALIZAÇÃO DOS DADOS BANCÁRIOS
// V.2609141710
// ============================================================

import pkg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function atualizarDadosBancarios() {
  console.log('🔧 Iniciando atualização dos dados bancários Asaas...\n');

  try {
    // Ler o SQL
    const sql = fs.readFileSync('wpp/routes/banco/atualizar_dados_bancarios_asaas.sql', 'utf8');

    // Separar em statements individuais (removendo comentários e queries de verificação)
    const updates = sql.split(';')
      .map(s => s.trim())
      .filter(s => s.startsWith('UPDATE'));

    console.log(`📝 Encontrados ${updates.length} comandos UPDATE\n`);

    // Executar cada UPDATE
    for (const update of updates) {
      const empresa = update.match(/empresa = '([^']+)'/)?.[1];

      console.log(`⏳ Atualizando ${empresa}...`);
      const result = await pool.query(update);
      console.log(`   ✅ ${result.rowCount} registros atualizados\n`);
    }

    // Verificação final
    console.log('📊 VERIFICAÇÃO FINAL:\n');

    const verificacao = await pool.query(`
      SELECT
        empresa,
        COUNT(*) as total,
        COUNT(CASE WHEN agencia IS NOT NULL THEN 1 END) as com_agencia,
        COUNT(CASE WHEN conta IS NOT NULL THEN 1 END) as com_conta
      FROM bank_extratos
      WHERE banco = 'Asaas'
      GROUP BY empresa
      ORDER BY empresa
    `);

    console.table(verificacao.rows);

    // Mostrar alguns exemplos
    console.log('\n📋 EXEMPLOS DE REGISTROS ATUALIZADOS:\n');

    const exemplos = await pool.query(`
      SELECT
        id,
        empresa,
        agencia,
        conta,
        conta_dv,
        data,
        valor,
        LEFT(descricao_original, 50) as descricao
      FROM bank_extratos
      WHERE banco = 'Asaas'
      ORDER BY id DESC
      LIMIT 10
    `);

    console.table(exemplos.rows);

    console.log('\n✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!\n');

  } catch (err) {
    console.error('❌ Erro ao atualizar:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

atualizarDadosBancarios();
