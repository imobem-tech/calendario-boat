// ============================================================
// VERIFICAR E CORRIGIR SCHEMA DAS TABELAS BANCÁRIAS
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function checkAndFixSchema() {
  try {
    console.log('🔍 Verificando schema de bank_extratos...\n');

    // Verificar colunas de bank_extratos
    const extratosCols = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'bank_extratos'
      ORDER BY ordinal_position
    `);

    console.log('📊 Colunas atuais de bank_extratos:');
    extratosCols.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''})`);
    });

    console.log('\n🔍 Verificando schema de bank_categorias...\n');

    // Verificar colunas de bank_categorias
    const categoriasCols = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'bank_categorias'
      ORDER BY ordinal_position
    `);

    console.log('📊 Colunas atuais de bank_categorias:');
    categoriasCols.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''})`);
    });

    // Verificar e adicionar colunas faltantes em bank_extratos
    console.log('\n🔧 Verificando colunas necessárias em bank_extratos...\n');

    const extratoColumns = extratosCols.rows.map(r => r.column_name);

    if (!extratoColumns.includes('status')) {
      console.log('➕ Adicionando coluna STATUS...');
      await pool.query(`ALTER TABLE bank_extratos ADD COLUMN status VARCHAR(20)`);
      await pool.query(`CREATE INDEX idx_bank_extratos_status ON bank_extratos(status)`);
      console.log('✅ Coluna STATUS adicionada!');
    } else {
      console.log('✅ Coluna STATUS já existe');
    }

    // Verificar e adicionar colunas faltantes em bank_categorias
    console.log('\n🔧 Verificando colunas necessárias em bank_categorias...\n');

    const categoriaColumns = categoriasCols.rows.map(r => r.column_name);

    if (!categoriaColumns.includes('chave_aprendida')) {
      console.log('➕ Adicionando coluna CHAVE_APRENDIDA...');
      await pool.query(`ALTER TABLE bank_categorias ADD COLUMN chave_aprendida TEXT`);
      console.log('✅ Coluna CHAVE_APRENDIDA adicionada!');
    } else {
      console.log('✅ Coluna CHAVE_APRENDIDA já existe');
    }

    if (!categoriaColumns.includes('palavras_chave')) {
      console.log('➕ Adicionando coluna PALAVRAS_CHAVE...');
      await pool.query(`ALTER TABLE bank_categorias ADD COLUMN palavras_chave TEXT`);
      console.log('✅ Coluna PALAVRAS_CHAVE adicionada!');
    } else {
      console.log('✅ Coluna PALAVRAS_CHAVE já existe');
    }

    console.log('\n✅ Verificação concluída!\n');

  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

checkAndFixSchema();
