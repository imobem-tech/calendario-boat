import { put } from '@vercel/blob';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log('🧪 TESTANDO VERCEL BLOB...\n');

    // Token do Vercel Blob
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    console.log('🔑 Token:', token ? '✅ Configurado' : '❌ Não encontrado');

    if (!token) {
      console.error('❌ BLOB_READ_WRITE_TOKEN não configurado!');
      process.exit(1);
    }

    // Criar arquivo de teste
    const conteudoTeste = 'Teste de upload para Vercel Blob - ' + new Date().toISOString();
    const buffer = Buffer.from(conteudoTeste, 'utf-8');

    console.log('\n📦 Arquivo de teste:');
    console.log('   Nome: teste_upload.txt');
    console.log('   Tamanho:', buffer.length, 'bytes');
    console.log('   Conteúdo:', conteudoTeste);

    // TESTE 1: Com access: 'public'
    console.log('\n\n🧪 TESTE 1: access: "public"');
    try {
      const blob1 = await put('teste/teste_upload_public.txt', buffer, {
        access: 'public',
        addRandomSuffix: false
      });
      console.log('✅ SUCESSO!');
      console.log('   URL:', blob1.url);
    } catch (err) {
      console.log('❌ ERRO:', err.message);
    }

    // TESTE 2: Sem access
    console.log('\n\n🧪 TESTE 2: SEM access (default)');
    try {
      const blob2 = await put('teste/teste_upload_default.txt', buffer, {
        addRandomSuffix: false
      });
      console.log('✅ SUCESSO!');
      console.log('   URL:', blob2.url);
    } catch (err) {
      console.log('❌ ERRO:', err.message);
    }

    console.log('\n\n✅ Testes concluídos!');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Erro geral:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
