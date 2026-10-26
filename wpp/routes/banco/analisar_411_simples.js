// Análise simples do ID 411
import pkg from 'pg';
import dotenv from 'dotenv';
import { classificarLancamento } from './classificacao-automatica.js';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function analisar() {
  try {
    // Buscar registro
    const result = await pool.query(`
      SELECT * FROM bank_extratos WHERE id = 411
    `);

    if (result.rows.length === 0) {
      console.log('❌ Registro não encontrado!');
      await pool.end();
      return;
    }

    const reg = result.rows[0];

    console.log('\n📋 REGISTRO ID 411:');
    console.log('='.repeat(60));
    console.log(`Descrição: ${reg.descricao_original}`);
    console.log(`Valor: R$ ${reg.valor}`);
    console.log(`Tipo: ${reg.tipo}`);
    console.log(`Empresa: ${reg.empresa}`);
    console.log(`CPF: ${reg.cpf_cnpj_origem || '(null)'}`);
    console.log(`Nome: ${reg.nome_origem || '(null)'}`);
    console.log(`Classificação: ${reg.classificacao || '(null)'}`);
    console.log(`Status: ${reg.status || '(null)'}`);
    console.log('');

    // Testar classificação
    console.log('🧪 TESTANDO CLASSIFICAÇÃO:');
    console.log('='.repeat(60));

    const resultado = await classificarLancamento({
      description: reg.descricao_original,
      value: Math.abs(reg.valor),
      tipo: reg.tipo,
      empresa: reg.empresa,
      cpfCnpjOrigem: reg.cpf_cnpj_origem
    });

    if (resultado && resultado.categoria_id) {
      console.log(`✅ CLASSIFICOU!`);
      console.log(`   Categoria: ${resultado.categoria_nome} (ID: ${resultado.categoria_id})`);
      console.log(`   Método: ${resultado.metodo}`);
    } else {
      console.log(`❌ NÃO CLASSIFICOU!`);
      console.log(`   Resultado: ${JSON.stringify(resultado, null, 2)}`);
    }
    console.log('');

    // Buscar categorias ativas
    console.log('📊 CATEGORIAS DISPONÍVEIS:');
    console.log('='.repeat(60));

    const cats = await pool.query(`
      SELECT id, nome, empresa, tipo, palavras_chave
      FROM bank_categorias
      WHERE ativo = true
        AND (empresa = $1 OR empresa = 'TODAS' OR empresa IS NULL)
        AND palavras_chave IS NOT NULL
        AND palavras_chave != ''
      ORDER BY nome
      LIMIT 20
    `, [reg.empresa]);

    cats.rows.forEach(c => {
      console.log(`${c.id}: ${c.nome} (${c.tipo || 'TODAS'})`);
      console.log(`   Palavras: ${c.palavras_chave}`);
    });

    console.log('');
    await pool.end();
  } catch (err) {
    console.error('❌ Erro:', err.message);
    await pool.end();
    process.exit(1);
  }
}

analisar();
