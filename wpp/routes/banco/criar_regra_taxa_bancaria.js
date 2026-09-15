// ============================================================
// criar_regra_taxa_bancaria.js — V.2609141958
// CRIAR REGRA DE CLASSIFICAÇÃO PARA TAXAS BANCÁRIAS
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function criarRegra() {
  try {
    console.log('\n📋 CRIANDO REGRA: Taxa Bancária');
    console.log('='.repeat(80));

    const result = await pool.query(`
      INSERT INTO bank_regras_classificacao (
        nome_regra,
        palavras_chave,
        classificacao,
        empresa,
        ativa,
        ativo,
        prioridade,
        criado_em
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW()
      )
      RETURNING id, nome_regra, palavras_chave, classificacao, empresa, ativa, ativo, prioridade
    `, [
      'Taxa Bancária',
      'Taxa de mensageria,Taxa do Pix,Taxa de notificacao',
      'Despesa - Taxa Bancária',
      'ALLMAX',  // ou NULL para todas empresas
      true,
      true,
      10
    ]);

    const regra = result.rows[0];

    console.log('✅ REGRA CRIADA COM SUCESSO!');
    console.log('='.repeat(80));
    console.log(`ID: ${regra.id}`);
    console.log(`Nome: ${regra.nome_regra}`);
    console.log(`Empresa: ${regra.empresa || '(todas)'}`);
    console.log(`Palavras-chave: ${regra.palavras_chave}`);
    console.log(`Classificação: ${regra.classificacao}`);
    console.log(`Ativa: ${regra.ativa}`);
    console.log(`Ativo: ${regra.ativo}`);
    console.log(`Prioridade: ${regra.prioridade}`);
    console.log('='.repeat(80));

    console.log('\n🎯 PRÓXIMOS PASSOS:');
    console.log('1. Execute a reclassificação novamente no site');
    console.log('2. Os registros com "Taxa de notificacao" serão classificados!');
    console.log('');

    await pool.end();

  } catch (err) {
    console.error('❌ ERRO:', err);

    if (err.code === '23505') {
      console.log('\n⚠️  Regra já existe! (duplicate key)');
    } else if (err.code === '42703') {
      console.log('\n⚠️  Coluna não existe! Verifique a estrutura da tabela.');
    }

    await pool.end();
    process.exit(1);
  }
}

criarRegra();
