// ============================================================
// excluir_tabela_regras_antiga.js — V.2609142105
// SCRIPT PARA EXCLUIR TABELA ANTIGA: bank_regras_classificacao
//
// MOTIVO: Substituída por bank_categorias
// DATA: 14/09/2026
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function excluirTabelaAntiga() {
  try {
    console.log('\n🗑️  EXCLUINDO TABELA ANTIGA...\n');
    console.log('='.repeat(80));

    // 1. Verificar se a tabela existe
    const verificar = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'bank_regras_classificacao'
      )
    `);

    if (!verificar.rows[0].exists) {
      console.log('❌ Tabela "bank_regras_classificacao" NÃO EXISTE!');
      console.log('   (Já foi excluída ou nunca existiu)');
      await pool.end();
      return;
    }

    console.log('✅ Tabela "bank_regras_classificacao" encontrada!');
    console.log('');

    // 2. Mostrar conteúdo antes de excluir (para backup)
    const conteudo = await pool.query(`
      SELECT * FROM bank_regras_classificacao
      ORDER BY id
    `);

    console.log(`📊 Registros na tabela: ${conteudo.rowCount}`);
    console.log('');

    if (conteudo.rowCount > 0) {
      console.log('📋 CONTEÚDO (para referência):');
      console.log('-'.repeat(80));
      conteudo.rows.slice(0, 10).forEach(r => {
        console.log(`ID ${r.id}: ${r.nome_regra} → ${r.classificacao}`);
        console.log(`   Palavras: ${r.palavras_chave}`);
        console.log(`   Empresa: ${r.empresa || 'TODAS'}`);
      });
      if (conteudo.rowCount > 10) {
        console.log(`... e mais ${conteudo.rowCount - 10} registros`);
      }
      console.log('-'.repeat(80));
      console.log('');
    }

    // 3. Excluir tabela (CASCADE remove dependências)
    console.log('🗑️  Excluindo tabela "bank_regras_classificacao"...');
    await pool.query(`DROP TABLE IF EXISTS bank_regras_classificacao CASCADE`);

    console.log('✅ TABELA EXCLUÍDA COM SUCESSO!');
    console.log('');
    console.log('📝 MOTIVO: Substituída por "bank_categorias"');
    console.log('   - bank_categorias.palavras_chave (classificação simples)');
    console.log('   - bank_categorias.chave_aprendida (classificação inteligente)');
    console.log('');
    console.log('='.repeat(80));
    console.log('✅ CONCLUÍDO!');
    console.log('');

    await pool.end();
  } catch (err) {
    console.error('❌ Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

excluirTabelaAntiga();
