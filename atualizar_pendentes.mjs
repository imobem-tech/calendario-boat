import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  console.log('🔍 Verificando registros PENDENTE...\n');

  // Primeiro contar quantos serão afetados
  const count = await pool.query(`
    SELECT COUNT(*) as total
    FROM bank_extratos
    WHERE status = 'PENDENTE'
  `);

  const total = parseInt(count.rows[0].total);

  if (total === 0) {
    console.log('✅ Nenhum registro PENDENTE encontrado!');
  } else {
    console.log(`⚠️  Encontrados ${total} registros com status PENDENTE\n`);
    
    // Mostrar alguns exemplos
    const exemplos = await pool.query(`
      SELECT id, empresa, data, valor, descricao_original
      FROM bank_extratos
      WHERE status = 'PENDENTE'
      ORDER BY data DESC
      LIMIT 5
    `);

    console.log('📋 Exemplos (últimos 5):\n');
    exemplos.rows.forEach(r => {
      const valorF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor);
      console.log(`  #${r.id} | ${r.empresa} | ${r.data.toLocaleDateString('pt-BR')} | ${valorF} | ${r.descricao_original}`);
    });

    console.log('\n━'.repeat(35));
    console.log(`\n🔄 Atualizando ${total} registros para OK...\n`);

    // Fazer UPDATE
    const result = await pool.query(`
      UPDATE bank_extratos
      SET status = 'OK'
      WHERE status = 'PENDENTE'
    `);

    console.log(`✅ ${result.rowCount} registros atualizados!\n`);
    console.log('━'.repeat(35));
    console.log('\n✨ Todos os registros PENDENTE agora estão OK!\n');
  }

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
