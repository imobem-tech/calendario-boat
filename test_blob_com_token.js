import { put } from '@vercel/blob';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log('🧪 TESTE COM TOKEN EXPLÍCITO\n');

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    console.log('🔑 Token:', token ? '✅ Configurado' : '❌ Não encontrado');

    const conteudo = 'Teste com token explícito - ' + Date.now();
    const buffer = Buffer.from(conteudo, 'utf-8');

    console.log('\n🧪 Upload com token explícito...');
    const blob = await put('teste_com_token.txt', buffer, {
      access: 'public',
      token: token,
      addRandomSuffix: false
    });

    console.log('✅ SUCESSO!');
    console.log('   URL:', blob.url);
    console.log('   pathname:', blob.pathname);

    process.exit(0);

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
