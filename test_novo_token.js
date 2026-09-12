import { put, list } from '@vercel/blob';

(async () => {
  try {
    const novoToken = 'vercel_blob_rw_OPWohB5ckMIWK75R_R6uWOHWDWGfOGZt8tkqMQeMeyo6BVr';

    console.log('🧪 TESTANDO NOVO TOKEN (PÚBLICO)\n');
    console.log('🔑 Token:', novoToken.substring(0, 20) + '...\n');

    // Teste 1: Listar blobs
    console.log('📋 Teste 1: Listando blobs...');
    const { blobs } = await list({ token: novoToken });
    console.log('✅ Listagem OK - Total:', blobs.length);

    // Teste 2: Upload com access public
    console.log('\n📤 Teste 2: Upload com access public...');
    const conteudo = 'Teste novo store público - ' + Date.now();
    const buffer = Buffer.from(conteudo, 'utf-8');

    const blob = await put('teste_upload.txt', buffer, {
      access: 'public',
      token: novoToken,
      addRandomSuffix: false
    });

    console.log('✅ UPLOAD FUNCIONOU!');
    console.log('   URL:', blob.url);
    console.log('   pathname:', blob.pathname);

    console.log('\n🎉 SUCESSO! Novo token está funcionando perfeitamente!\n');
    process.exit(0);

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    process.exit(1);
  }
})();
