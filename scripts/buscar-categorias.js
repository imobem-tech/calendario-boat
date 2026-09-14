import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function buscarCategorias() {
  try {
    console.log('🔍 Buscando categorias CREDITO com palavras_chave...\n');

    const result = await pool.query(`
      SELECT
        id,
        nome,
        palavras_chave,
        empresa,
        ativo,
        tipo
      FROM bank_categorias
      WHERE tipo = 'CREDITO'
        AND palavras_chave IS NOT NULL
        AND palavras_chave != ''
        AND empresa IN ('ALLMAX', 'TODAS')
      ORDER BY empresa, nome
    `);

    console.log(`📊 Encontradas ${result.rows.length} categorias (ALLMAX ou TODAS):\n`);

    result.rows.forEach(cat => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`ID: ${cat.id}`);
      console.log(`Nome: ${cat.nome}`);
      console.log(`Empresa: ${cat.empresa}`);
      console.log(`Ativo: ${cat.ativo ? '✅' : '❌'}`);
      console.log(`Palavras-chave: "${cat.palavras_chave}"`);
      console.log('');
    });

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Verificar se "Hora_MOTOR" bate com alguma
    console.log('🔎 Testando match com "Hora_MOTOR 573-Y1 11/09/2026 1.0h":\n');

    const descricao = 'Hora_MOTOR 573-Y1 11/09/2026 1.0h';

    result.rows.forEach(cat => {
      const palavras = cat.palavras_chave.split(',');
      let bateu = false;

      palavras.forEach(palavra => {
        const palavraTrim = palavra.trim().toLowerCase();
        const descLower = descricao.toLowerCase();

        if (descLower.includes(palavraTrim)) {
          console.log(`✅ MATCH! Categoria "${cat.nome}" → palavra "${palavra.trim()}"`);
          bateu = true;
        }
      });

      if (!bateu) {
        console.log(`❌ NÃO bateu: "${cat.nome}"`);
      }
    });

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

buscarCategorias();
