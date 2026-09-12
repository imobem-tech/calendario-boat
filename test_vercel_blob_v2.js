import { put } from '@vercel/blob';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log('🧪 TESTANDO VERCEL BLOB V2...\n');

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    console.log('🔑 Token:', token ? '✅ Configurado' : '❌ Não encontrado');

    const conteudoTeste = 'Teste V2 - ' + new Date().toISOString();
    const buffer = Buffer.from(conteudoTeste, 'utf-8');

    // TESTE 3: Com access: 'private'
    console.log('\n🧪 TESTE 3: access: "private"');
    try {
      const blob3 = await put('teste/teste_upload_private.txt', buffer, {
        access: 'private',
        addRandomSuffix: false
      });
      console.log('✅ SUCESSO!');
      console.log('   URL:', blob3.url);
      console.log('   downloadUrl:', blob3.downloadUrl);
    } catch (err) {
      console.log('❌ ERRO:', err.message);
    }

    console.log('\n✅ Teste concluído!');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Erro geral:', err.message);
    process.exit(1);
  }
})();
