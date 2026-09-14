// ============================================================
// CRIAR TABELA file_tokens
// V.2609141725
// ============================================================

import pkg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

// Carregar .env
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function criarTabela() {
  console.log('🗄️  Migrando tabela file_tokens...');

  const sql = fs.readFileSync('wpp/routes/banco/migrar_tabela_tokens.sql', 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Tabela file_tokens criada com sucesso!');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('ℹ️  Tabela file_tokens já existe');
    } else {
      console.error('❌ Erro ao criar tabela:', err.message);
      throw err;
    }
  } finally {
    await pool.end();
  }
}

criarTabela();
