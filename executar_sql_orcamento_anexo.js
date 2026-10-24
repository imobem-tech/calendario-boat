// ============================================================
// executar_sql_orcamento_anexo.js — V.2610241555
// Cria tabela orcamento_anexo no banco
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function executarSQL() {
  try {
    console.log('📦 Criando tabela orcamento_anexo...');

    const sql = readFileSync('sql/criar_tabela_orcamento_anexo.sql', 'utf8');

    await pool.query(sql);

    console.log('✅ Tabela orcamento_anexo criada com sucesso!');
    console.log('✅ Índices criados!');

    // Verificar criação
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orcamento_anexo'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Estrutura da tabela:');
    result.rows.forEach(col => {
      console.log(`   ${col.column_name.padEnd(20)} ${col.data_type.padEnd(30)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    process.exit(0);

  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error.message);
    process.exit(1);
  }
}

executarSQL();

// ============================================================
// FIM — V.2610241555
// ============================================================
