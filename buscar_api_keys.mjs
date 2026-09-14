import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  console.log('🔍 Buscando API Keys na tabela centro_custos...\n');

  const result = await pool.query(`
    SELECT 
      id,
      nome,
      asaas_api_key,
      asaas_webhook_token
    FROM centro_custos
    WHERE asaas_api_key IS NOT NULL
    ORDER BY nome
  `);

  if (result.rows.length === 0) {
    console.log('❌ Nenhuma API Key encontrada');
  } else {
    console.log(`✅ ${result.rows.length} empresa(s) com API Key:\n`);
    
    result.rows.forEach(r => {
      console.log('━'.repeat(60));
      console.log(`🏢 ${r.nome} (ID: ${r.id})`);
      console.log(`📝 API Key: ${r.asaas_api_key || '(vazio)'}`);
      console.log(`🔐 Webhook Token: ${r.asaas_webhook_token || '(vazio)'}`);
      console.log('');
    });
    
    console.log('━'.repeat(60));
    console.log('\n📋 PARA RAILWAY (Environment Variables):\n');
    
    result.rows.forEach(r => {
      const nomeVar = r.nome.toUpperCase().replace(/\s+/g, '_');
      console.log(`ASAAS_API_KEY_${nomeVar}=${r.asaas_api_key || ''}`);
    });
  }

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
