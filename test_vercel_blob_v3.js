import { put, list } from '@vercel/blob';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log('🧪 TESTANDO VERCEL BLOB V3...\n');

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    console.log('🔑 Token:', token ? '✅ Configurado' : '❌ Não encontrado');
    console.log('🔑 Token (primeiros 20 chars):', token?.substring(0, 20) + '...');

    // PRIMEIRO: Listar blobs existentes
    console.log('\n📋 Listando blobs existentes...');
    try {
      const { blobs } = await list();
      console.log('✅ SUCESSO na listagem!');
      console.log('   Total de blobs:', blobs.length);
      if (blobs.length > 0) {
        console.log('\n   Primeiros 5 blobs:');
        blobs.slice(0, 5).forEach((b, i) => {
          console.log(`   ${i + 1}. ${b.pathname}`);
        });
      }
    } catch (err) {
      console.log('❌ ERRO na listagem:', err.message);
    }

    // TESTE: Upload simples sem pasta
    console.log('\n\n🧪 TESTE: Upload simples (teste.txt)');
    const conteudoTeste = 'Teste simples - ' + new Date().toISOString();
    const buffer = Buffer.from(conteudoTeste, 'utf-8');

    try {
      const blob = await put('teste.txt', buffer, {
        access: 'public',
        addRandomSuffix: false
      });
      console.log('✅ SUCESSO!');
      console.log('   URL:', blob.url);
    } catch (err) {
      console.log('❌ ERRO:', err.message);
      console.log('   Código:', err.code);
      console.log('   Stack:', err.stack);
    }

    console.log('\n✅ Teste concluído!');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Erro geral:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
