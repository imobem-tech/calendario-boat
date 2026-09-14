// ============================================================
// SCRIPT: Adicionar coluna STATUS na tabela bank_extratos
// Data: 12/09/2026 23:10
// Uso: node scripts/add-status-column.js
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function addStatusColumn() {
  console.log('🔧 Iniciando migração: Adicionar coluna STATUS...\n');

  try {
    // Verificar se coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'bank_extratos'
      AND column_name = 'status'
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna STATUS já existe!');
      console.log('   Nenhuma alteração necessária.\n');
      return;
    }

    console.log('📝 Coluna STATUS não encontrada, adicionando...');

    // Adicionar coluna
    await pool.query(`
      ALTER TABLE bank_extratos
      ADD COLUMN status VARCHAR(20)
    `);

    console.log('✅ Coluna STATUS adicionada!');

    // Criar índice
    await pool.query(`
      CREATE INDEX idx_bank_extratos_status
      ON bank_extratos(status)
    `);

    console.log('✅ Índice criado!');

    // Verificar quantos registros existem
    const count = await pool.query(`
      SELECT COUNT(*) as total FROM bank_extratos
    `);

    console.log(`\n📊 Total de lançamentos na tabela: ${count.rows[0].total}`);
    console.log('   Todos ficaram com status = NULL (esperado)');
    console.log('   Novos lançamentos receberão status automaticamente.\n');

    console.log('✅ Migração concluída com sucesso!\n');

  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
    console.error('   Stack:', err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Executar
addStatusColumn();

// ============================================================
// FIM
// ============================================================
