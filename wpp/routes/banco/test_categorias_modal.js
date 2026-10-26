// ============================================================
// TEST: Simular filtro de categorias do modal de edição
// V.2609150026
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function testarFiltro() {
  console.log('🧪 TESTANDO FILTRO DE CATEGORIAS DO MODAL\n');

  // 1. Buscar todas as categorias
  console.log('📦 1. BUSCANDO CATEGORIAS DA TABELA bank_categorias:');
  const categorias = await pool.query(`
    SELECT id, nome, icone, cor, empresa, tipo
    FROM bank_categorias
    ORDER BY nome
  `);

  console.log(`Total categorias no banco: ${categorias.rows.length}\n`);

  if (categorias.rows.length > 0) {
    console.log('Primeiras 5 categorias:');
    categorias.rows.slice(0, 5).forEach(cat => {
      console.log(`  - ID ${cat.id}: ${cat.icone} ${cat.nome} (Empresa: ${cat.empresa || 'NULL'}, Tipo: ${cat.tipo || 'NULL'})`);
    });
    console.log('');
  }

  // 2. Simular lançamento ID 411 (CHARLES COSTA LOPES)
  console.log('💰 2. LANÇAMENTO SIMULADO:');
  const lancamento = {
    id: 411,
    empresa: 'ALLMAX',
    tipo: 'CREDITO',
    valor: 199.00
  };
  console.log(lancamento);
  console.log('');

  // 3. Aplicar filtro (mesma lógica do HTML)
  console.log('🔍 3. APLICANDO FILTRO (mesma lógica do modal):');

  // ✅ FIX: Usar tipo direto, não converter
  const tipoEsperado = lancamento.tipo; // CREDITO ou DEBITO
  console.log(`Tipo esperado (corrigido): ${tipoEsperado}\n`);

  let categoriasAdicionadas = 0;
  const categoriasOK = [];
  const categoriasIgnoradas = [];

  categorias.rows.forEach(cat => {
    // Filtrar por empresa
    const empresaOK = !cat.empresa || cat.empresa === 'TODAS' || cat.empresa === lancamento.empresa;

    // Filtrar por tipo
    const tipoOK = !cat.tipo || cat.tipo === 'TODAS' || cat.tipo === tipoEsperado;

    if (empresaOK && tipoOK) {
      categoriasOK.push(cat);
      categoriasAdicionadas++;
    } else {
      categoriasIgnoradas.push({
        id: cat.id,
        nome: cat.nome,
        catEmpresa: cat.empresa,
        catTipo: cat.tipo,
        empresaOK,
        tipoOK,
        motivo: !empresaOK ? 'Empresa não bate' : 'Tipo não bate'
      });
    }
  });

  console.log(`✅ Categorias que PASSAM no filtro: ${categoriasAdicionadas}`);
  if (categoriasOK.length > 0) {
    console.log('\nCategorias aprovadas:');
    categoriasOK.forEach(cat => {
      console.log(`  ✅ ID ${cat.id}: ${cat.icone} ${cat.nome} (Empresa: ${cat.empresa || 'NULL'}, Tipo: ${cat.tipo || 'NULL'})`);
    });
  }
  console.log('');

  console.log(`❌ Categorias IGNORADAS: ${categoriasIgnoradas.length}`);
  if (categoriasIgnoradas.length > 0 && categoriasIgnoradas.length <= 20) {
    console.log('\nPor que foram ignoradas:');
    categoriasIgnoradas.forEach(cat => {
      console.log(`  ❌ ${cat.nome}:`);
      console.log(`     Empresa cat: ${cat.catEmpresa} | Esperado: ALLMAX ou NULL ou TODAS`);
      console.log(`     Tipo cat: ${cat.catTipo} | Esperado: ${tipoEsperado} ou NULL ou TODAS`);
      console.log(`     Motivo: ${cat.motivo}`);
    });
  }
  console.log('');

  // 4. Conclusão
  console.log('📋 4. CONCLUSÃO:');
  if (categoriasAdicionadas === 0) {
    console.log('❌ PROBLEMA: Nenhuma categoria passa no filtro!');
    console.log('   Isso explica por que o combo fica vazio.');
    console.log('');
    console.log('💡 POSSÍVEIS CAUSAS:');
    console.log('   1. Categorias não têm empresa=NULL e empresa!=ALLMAX');
    console.log('   2. Categorias não têm tipo=NULL e tipo!=RECEITA');
    console.log('   3. Filtro muito restritivo');
  } else {
    console.log(`✅ OK: ${categoriasAdicionadas} categoria(s) disponível(is) para o modal`);
  }

  await pool.end();
}

testarFiltro().catch(console.error);
