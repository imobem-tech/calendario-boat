// ============================================================
// migration_palavras_chave.js — V.260912120000
// MIGRAÇÃO: Adiciona coluna palavras_chave em bank_categorias
// POPULA: Palavras-chave inteligentes com wildcards
// EXECUÇÃO: node migration_palavras_chave.js
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrar() {
  console.log('🔧 Iniciando migração de palavras-chave...\n');

  try {
    // 1️⃣ Criar extensão unaccent (para normalização)
    console.log('1️⃣ Criando extensão unaccent...');
    await pool.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    console.log('✅ Extensão unaccent OK\n');

    // 2️⃣ Adicionar coluna palavras_chave
    console.log('2️⃣ Adicionando coluna palavras_chave...');
    await pool.query(`
      ALTER TABLE bank_categorias
      ADD COLUMN IF NOT EXISTS palavras_chave TEXT
    `);
    console.log('✅ Coluna palavras_chave OK\n');

    // 3️⃣ Popular palavras-chave
    console.log('3️⃣ Populando palavras-chave...\n');

    const regras = [
      // IMOBEM - CRÉDITO
      { id: 33, palavras: 'VIDA,Ct_3o,*terceiro*' },

      // IMOBEM - DÉBITO
      { id: 32, palavras: 'aluguel,*locação*,*loca*' },
      { id: 20, palavras: 'lote,terreno,*imóvel*,*imovel*,prestação' },
      { id: 34, palavras: 'celular,telefone,*telecom*,*vivo*,*tim*,*claro*' },
      { id: 35, palavras: 'contador,contabilidade,*contábil*' },
      { id: 19, palavras: 'IPTU,*imposto predial*' },
      { id: 36, palavras: 'energia,*luz*,CEMIG,*energia elétrica*' },
      { id: 37, palavras: 'água,*saneamento*,COPASA' },
      { id: 26, palavras: 'internet,*wifi*,*banda larga*' },
      { id: 38, palavras: '*seguro*' },
      { id: 29, palavras: 'condomínio,*condominio*' },

      // ALLMAX - CRÉDITO (exemplo)
      { id: 1, palavras: 'mensalidade,*mensalista*,*aluguel barco*' },
      { id: 2, palavras: '*diária*,*day use*' },

      // ALLMAX - DÉBITO (exemplo)
      { id: 10, palavras: 'combustível,*gasolina*,*diesel*,*combustivel*' },
      { id: 11, palavras: 'manutenção,*manutencao*,*reparo*,*conserto*' }
    ];

    let atualizados = 0;
    for (const regra of regras) {
      const result = await pool.query(`
        UPDATE bank_categorias
        SET palavras_chave = $1
        WHERE id = $2
        RETURNING id, nome
      `, [regra.palavras, regra.id]);

      if (result.rows.length > 0) {
        console.log(`   ✅ ID ${regra.id}: ${result.rows[0].nome}`);
        console.log(`      Palavras: ${regra.palavras}\n`);
        atualizados++;
      }
    }

    console.log(`\n✅ Migração concluída! ${atualizados} categorias atualizadas.`);
    console.log('\n📋 PRÓXIMOS PASSOS:');
    console.log('   1. Adicionar mais palavras-chave manualmente via SQL ou API');
    console.log('   2. Testar classificação automática');
    console.log('   3. Ajustar wildcards conforme necessário\n');

  } catch (err) {
    console.error('❌ Erro na migração:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

migrar();

// ============================================================
// FIM
// ============================================================
