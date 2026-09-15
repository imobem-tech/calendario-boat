import dotenv from 'dotenv';
dotenv.config();

console.log('\n🔑 VERIFICANDO API KEYS:\n');
console.log('ALLMAX:', process.env.ASAAS_API_KEY_ALLMAX ? '✅ Configurada' : '❌ NÃO encontrada');
console.log('IMOBEM:', process.env.ASAAS_API_KEY_IMOBEM ? '✅ Configurada' : '❌ NÃO encontrada');
console.log('SUMMER:', process.env.ASAAS_API_KEY_SUMMER ? '✅ Configurada' : '❌ NÃO encontrada');
console.log('IMOBAN:', process.env.ASAAS_API_KEY_IMOBAN ? '✅ Configurada' : '❌ NÃO encontrada');

console.log('\n📋 TODAS AS VARIÁVEIS ASAAS_*:\n');
Object.keys(process.env)
  .filter(k => k.includes('ASAAS'))
  .forEach(k => console.log(`  ${k}: ${process.env[k] ? '(configurada)' : '(vazia)'}`));
