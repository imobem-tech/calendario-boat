import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  console.log('🔍 Verificando registros PENDENTE na tabela bank_extratos...\n');

  const result = await pool.query(`
    SELECT 
      id,
      empresa,
      data,
      valor,
      descricao_original,
      status,
      classificacao,
      tipo
    FROM bank_extratos
    WHERE status = 'PENDENTE'
    ORDER BY data DESC, id DESC
  `);

  console.log(`📊 Total de registros PENDENTE: ${result.rows.length}\n`);

  if (result.rows.length === 0) {
    console.log('✅ Nenhum registro PENDENTE encontrado!');
  } else {
    console.log('━'.repeat(80));
    result.rows.forEach((r, idx) => {
      const valorF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor);
      console.log(`\n${idx + 1}. ID: ${r.id}`);
      console.log(`   Empresa: ${r.empresa}`);
      console.log(`   Data: ${new Date(r.data).toLocaleDateString('pt-BR')}`);
      console.log(`   Valor: ${valorF}`);
      console.log(`   Tipo: ${r.tipo}`);
      console.log(`   Status: ${r.status}`);
      console.log(`   Classificação: ${r.classificacao || '(nulo)'}`);
      console.log(`   Descrição: ${r.descricao_original}`);
      console.log('   ' + '─'.repeat(76));
    });
    console.log('━'.repeat(80));
  }

  // Verificar também se tem algum com status NULL
  const nullStatus = await pool.query(`
    SELECT COUNT(*) as total
    FROM bank_extratos
    WHERE status IS NULL
  `);

  if (parseInt(nullStatus.rows[0].total) > 0) {
    console.log(`\n⚠️  ATENÇÃO: ${nullStatus.rows[0].total} registros com status NULL (sem status definido)`);
  }

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
