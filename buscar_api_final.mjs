import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  console.log('🔍 Buscando API Keys dos Centros de Custo...\n');

  const dados = await pool.query(`
    SELECT 
      "Codigo",
      "Empresa",
      "Descrição",
      "API_Key",
      "webhookURL"
    FROM "Centros_Custos" 
    WHERE "API_Key" IS NOT NULL 
      AND "API_Key" != ''
    ORDER BY "Empresa"
  `);

  if (dados.rows.length === 0) {
    console.log('❌ Nenhuma API Key encontrada\n');
  } else {
    console.log(`✅ ${dados.rows.length} centro(s) com API Key:\n`);
    
    dados.rows.forEach(r => {
      console.log('━'.repeat(70));
      console.log(`🏢 ${r.Descrição} (Empresa: ${r.Empresa})`);
      console.log(`📝 API Key: ${r.API_Key}`);
      console.log(`🔗 Webhook: ${r.webhookURL || '(não configurado)'}`);
      console.log('');
    });
    
    console.log('━'.repeat(70));
    console.log('\n📋 PARA COPIAR NO RAILWAY:\n');
    
    // Mapear empresas
    const empresas = {
      1: 'ALLMAX',
      2: 'SUMMER',
      3: 'IMOBEM',
      4: 'IMOBAN'
    };
    
    dados.rows.forEach(r => {
      const nomeEmpresa = empresas[r.Empresa] || `EMPRESA${r.Empresa}`;
      console.log(`ASAAS_API_KEY_${nomeEmpresa}`);
      console.log(`${r.API_Key}`);
      console.log('');
    });
  }

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
