// Corrigir classificacao de NOME para ID
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function corrigir() {
  try {
    console.log('\n🔧 CORRIGINDO CLASSIFICAÇÕES...\n');
    console.log('='.repeat(80));

    // Buscar categoria "Taxa Bancária"
    const cat = await pool.query(`
      SELECT id, nome FROM bank_categorias WHERE nome = 'Taxa Bancária'
    `);

    if (cat.rows.length === 0) {
      console.log('❌ Categoria "Taxa Bancária" não encontrada!');
      await pool.end();
      return;
    }

    const categoriaId = cat.rows[0].id;
    console.log(`✅ Categoria encontrada: ID ${categoriaId} - ${cat.rows[0].nome}`);
    console.log('');

    // Atualizar registros que têm o NOME
    const result = await pool.query(`
      UPDATE bank_extratos
      SET classificacao = $1::TEXT
      WHERE classificacao = 'Taxa Bancária'
      RETURNING id, data, descricao_original
    `, [categoriaId]);

    console.log(`✅ Atualizados: ${result.rowCount} registros`);
    console.log('');

    if (result.rows.length > 0) {
      console.log('Registros corrigidos:');
      result.rows.slice(0, 10).forEach(r => {
        console.log(`  - ID ${r.id}: ${r.data.toISOString().split('T')[0]} - ${r.descricao_original.substring(0, 50)}`);
      });
      if (result.rows.length > 10) {
        console.log(`  ... e mais ${result.rows.length - 10} registros`);
      }
    }

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

corrigir();
