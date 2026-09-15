// Verificar regras de classificação
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verificar() {
  try {
    console.log('🔍 VERIFICANDO REGRAS DE CLASSIFICAÇÃO:\n');

    // 1. Palavras-chave
    const pk = await pool.query(`
      SELECT COUNT(*) as total FROM regras_classificacao_palavras
    `);
    console.log(`  Palavras-chave: ${pk.rows[0].total}`);

    // 2. Chaves aprendidas
    const ca = await pool.query(`
      SELECT COUNT(*) as total FROM chaves_aprendidas
    `);
    console.log(`  Chaves aprendidas: ${ca.rows[0].total}`);

    // 3. Categorias
    const cat = await pool.query(`
      SELECT COUNT(*) as total FROM categorias_bancarias
    `);
    console.log(`  Categorias: ${cat.rows[0].total}\n`);

    // Exemplos de palavras-chave
    const exemplos = await pool.query(`
      SELECT palavra_chave, categoria_id, tipo
      FROM regras_classificacao_palavras
      LIMIT 10
    `);

    if (exemplos.rows.length > 0) {
      console.log('📋 EXEMPLOS DE PALAVRAS-CHAVE:\n');
      exemplos.rows.forEach(r => {
        console.log(`  "${r.palavra_chave}" → Categoria ${r.categoria_id} (${r.tipo})`);
      });
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

verificar();
