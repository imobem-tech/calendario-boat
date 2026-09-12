import { put } from '@vercel/blob';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log('🧪 TESTE FINAL - TODAS AS COMBINAÇÕES\n');
    console.log('=' .repeat(60));

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    console.log('🔑 Token:', token);
    console.log('=' .repeat(60));

    const conteudo = 'Teste final - ' + Date.now();
    const buffer = Buffer.from(conteudo, 'utf-8');

    const testes = [
      { nome: 'PUBLIC', opcoes: { access: 'public', addRandomSuffix: false } },
      { nome: 'PRIVATE', opcoes: { access: 'private', addRandomSuffix: false } },
      { nome: 'SEM ACCESS', opcoes: { addRandomSuffix: false } },
      { nome: 'VAZIO', opcoes: {} }
    ];

    for (const teste of testes) {
      console.log(`\n\n🧪 TESTE: ${teste.nome}`);
      console.log('   Opções:', JSON.stringify(teste.opcoes, null, 2));
      console.log('   -'.repeat(30));

      try {
        const blob = await put(`teste_${teste.nome.toLowerCase()}.txt`, buffer, teste.opcoes);
        console.log('   ✅ SUCESSO!');
        console.log('   URL:', blob.url);
        console.log('   pathname:', blob.pathname);
        if (blob.downloadUrl) {
          console.log('   downloadUrl:', blob.downloadUrl);
        }
      } catch (err) {
        console.log('   ❌ ERRO:', err.message);
      }
    }

    console.log('\n\n' + '=' .repeat(60));
    console.log('✅ Testes concluídos!');
    console.log('=' .repeat(60));
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Erro fatal:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
