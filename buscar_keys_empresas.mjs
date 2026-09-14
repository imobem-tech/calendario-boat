import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  console.log('🔍 Buscando API Keys na tabela mae_empresa...\n');

  const result = await pool.query(`
    SELECT 
      id,
      nome,
      sigla,
      asaas_api_key
    FROM mae_empresa
    WHERE asaas_api_key IS NOT NULL
      AND asaas_api_key != ''
    ORDER BY nome
  `);

  if (result.rows.length === 0) {
    console.log('❌ Nenhuma API Key encontrada\n');
    
    // Tentar sem filtro
    const all = await pool.query(`SELECT id, nome, sigla, asaas_api_key FROM mae_empresa ORDER BY nome`);
    console.log('Todas as empresas:\n');
    all.rows.forEach(r => {
      console.log(`  ${r.nome} (${r.sigla}): ${r.asaas_api_key ? 'TEM KEY' : 'SEM KEY'}`);
    });
    
  } else {
    console.log(`✅ ${result.rows.length} empresa(s) com API Key:\n`);
    
    result.rows.forEach(r => {
      console.log('━'.repeat(70));
      console.log(`🏢 ${r.nome} (${r.sigla})`);
      console.log(`📝 API Key: ${r.asaas_api_key}`);
      console.log('');
    });
    
    console.log('━'.repeat(70));
    console.log('\n📋 PARA COPIAR NO RAILWAY:\n');
    
    result.rows.forEach(r => {
      const sigla = r.sigla || r.nome.toUpperCase();
      console.log(`ASAAS_API_KEY_${sigla}`);
      console.log(`${r.asaas_api_key}`);
      console.log('');
    });
  }

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
