// ============================================================
// migration_chave_aprendida.js — V.260912150000
// MIGRAÇÃO: Adiciona coluna chave_aprendida em bank_categorias
// SISTEMA DE APRENDIZADO: frase|valor|tolerancia|observacao
// EXECUÇÃO: node migration_chave_aprendida.js
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrar() {
  console.log('🔧 Iniciando migração de chave aprendida...\n');

  try {
    // 1️⃣ Adicionar coluna chave_aprendida
    console.log('1️⃣ Adicionando coluna chave_aprendida...');
    await pool.query(`
      ALTER TABLE bank_categorias
      ADD COLUMN IF NOT EXISTS chave_aprendida TEXT
    `);
    console.log('✅ Coluna chave_aprendida OK\n');

    console.log('✅ Migração concluída!\n');
    console.log('📋 FORMATO DO CAMPO:');
    console.log('   frase_chave|valor_inteiro|tolerancia_percent|observacao\n');
    console.log('📋 EXEMPLO:');
    console.log('   Hora_MOTOR 586-E2|98|10|X, TARIFA MANUT CONTA|15|0|Taxa mensal\n');
    console.log('📋 SEPARADORES:');
    console.log('   | (pipe) → separa campos dentro de uma regra');
    console.log('   , (vírgula) → separa múltiplas regras\n');
    console.log('📋 PRÓXIMOS PASSOS:');
    console.log('   1. Testar comando "aprender" no WhatsApp');
    console.log('   2. Sistema aprende automaticamente');
    console.log('   3. Próximas vezes não precisam recibo!\n');

  } catch (err) {
    console.error('❌ Erro na migração:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

migrar();

// ============================================================
// FIM
// ============================================================
