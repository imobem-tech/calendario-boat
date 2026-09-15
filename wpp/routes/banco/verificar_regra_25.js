// Verificar regra ID 25
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verificar() {
  try {
    const result = await pool.query(`
      SELECT id, nome_regra, empresa, ativa, ativo, palavras_chave, classificacao, prioridade
      FROM bank_regras_classificacao
      WHERE id = 25
    `);

    if (result.rows.length === 0) {
      console.log('❌ Regra ID 25 NÃO EXISTE!');
    } else {
      const regra = result.rows[0];
      console.log('\n📋 REGRA ID 25:');
      console.log('='.repeat(80));
      console.log(`Nome: ${regra.nome_regra}`);
      console.log(`Empresa: ${regra.empresa || '(NULL - todas empresas)'}`);
      console.log(`Ativa: ${regra.ativa}`);
      console.log(`Ativo: ${regra.ativo}`);
      console.log(`Prioridade: ${regra.prioridade}`);
      console.log(`Palavras-chave: ${regra.palavras_chave}`);
      console.log(`Classificação: ${regra.classificacao}`);
      console.log('='.repeat(80));

      if (!regra.ativa) {
        console.log('⚠️  PROBLEMA: ativa = false');
      }
      if (!regra.ativo) {
        console.log('⚠️  PROBLEMA: ativo = false');
      }
      if (regra.empresa && regra.empresa !== 'ALLMAX') {
        console.log(`⚠️  PROBLEMA: empresa = "${regra.empresa}" (deveria ser ALLMAX ou NULL)`);
      }
      if (!regra.palavras_chave) {
        console.log('⚠️  PROBLEMA: palavras_chave está vazio');
      }
    }

    await pool.end();
  } catch (err) {
    console.error('Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

verificar();
