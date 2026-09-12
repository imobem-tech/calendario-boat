import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('🔄 Revertendo categorias gerais ALLMAX → TODAS...\n');

// Lista de categorias que devem ser TODAS (usadas por todas empresas)
const categoriasGerais = [
  'Aplicação Financeira',
  'Aporte Capital Social',
  'Condomínio',
  'Encargos Folha',
  'Energia Elétrica',
  'Folha Pagamento',
  'IPTU',
  'Mensalidade',
  'Parte Cota',
  'Prestação Imóvel',
  'Prolabore',
  'Repasse Combustível',
  'Resgate Aplicação',
  'Taxa Bancária',
  'Transferência Entre Contas'
];

try {
  console.log('📋 Categorias que serão alteradas para TODAS:\n');
  console.table(categoriasGerais);

  // Alterar para TODAS
  const result = await pool.query(`
    UPDATE bank_categorias
    SET empresa = 'TODAS'
    WHERE empresa = 'ALLMAX'
      AND nome = ANY($1)
  `, [categoriasGerais]);

  console.log(`\n✅ ${result.rowCount} categorias alteradas para TODAS!\n`);

  // Mostrar distribuição
  console.log('📊 Distribuição por empresa:\n');
  const dist = await pool.query(`
    SELECT empresa, COUNT(*) as total
    FROM bank_categorias
    GROUP BY empresa
    ORDER BY empresa
  `);
  console.table(dist.rows);

  console.log('\n✅ Revertido com sucesso!');

} catch (e) {
  console.error('❌ Erro:', e.message);
} finally {
  await pool.end();
}
