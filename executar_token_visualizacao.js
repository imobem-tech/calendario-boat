// ============================================================
// executar_token_visualizacao.js — V.2610241950
// Executa SQL para adicionar token_visualizacao
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function executar() {
  try {
    console.log('📦 Adicionando coluna token_visualizacao...\n');

    const sql = readFileSync('sql/adicionar_token_visualizacao.sql', 'utf8');

    await pool.query(sql);

    console.log('✅ Coluna token_visualizacao adicionada com sucesso!\n');

    // Verificar
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orcamento_servico' AND column_name = 'token_visualizacao'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Confirmação:');
      console.log(`   ${result.rows[0].column_name} (${result.rows[0].data_type}) - ${result.rows[0].is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Erro ao adicionar coluna:', error.message);
    process.exit(1);
  }
}

executar();

// ============================================================
// FIM — V.2610241950
// ============================================================
