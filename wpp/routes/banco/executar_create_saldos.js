// ============================================================
// executar_create_saldos.js
// Executa criação da tabela bank_saldos_iniciais
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function executar() {
  try {
    console.log('🔧 Conectando ao banco...');

    // Ler SQL
    const sqlPath = join(__dirname, 'create_saldos_iniciais.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Executando SQL...');
    await pool.query(sql);

    console.log('✅ Tabela bank_saldos_iniciais criada com sucesso!');

    // Verificar
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'bank_saldos_iniciais'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Estrutura da tabela:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    await pool.end();

  } catch (err) {
    console.error('❌ Erro:', err.message);
    await pool.end();
    process.exit(1);
  }
}

executar();
