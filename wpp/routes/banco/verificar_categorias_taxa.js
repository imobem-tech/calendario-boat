// Verificar categorias com palavras "taxa"
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verificar() {
  try {
    console.log('\n📋 CATEGORIAS COM "TAXA" NAS PALAVRAS-CHAVE:\n');
    console.log('='.repeat(120));

    const result = await pool.query(`
      SELECT id, nome, empresa, ativo, palavras_chave, chave_aprendida, ordem
      FROM bank_categorias
      WHERE ativo = true
        AND (
          LOWER(palavras_chave) LIKE '%taxa%'
          OR LOWER(chave_aprendida) LIKE '%taxa%'
        )
      ORDER BY empresa, ordem
    `);

    if (result.rows.length === 0) {
      console.log('❌ NENHUMA CATEGORIA ENCONTRADA COM "TAXA"!');
      console.log('\nIsso explica por que não classificou!\n');
    } else {
      result.rows.forEach(cat => {
        console.log(`ID: ${cat.id}`);
        console.log(`Nome: ${cat.nome}`);
        console.log(`Empresa: ${cat.empresa || '(todas)'}`);
        console.log(`Ativo: ${cat.ativo}`);
        console.log(`Ordem: ${cat.ordem}`);
        console.log(`Palavras-chave: ${cat.palavras_chave || '(vazio)'}`);
        console.log(`Chave aprendida: ${cat.chave_aprendida || '(vazio)'}`);
        console.log('-'.repeat(120));
      });

      console.log(`\n✅ Total: ${result.rows.length} categorias encontradas\n`);
    }

    await pool.end();
  } catch (err) {
    console.error('Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

verificar();
