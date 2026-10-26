import { del } from '@vercel/blob';
import dotenv from 'dotenv';

dotenv.config();

const url = 'https://opwohb5ckmiwk75r.public.blob.vercel-storage.com/orcamentos/51/orc_51_1792931533791.pdf';

console.log('🗑️  Deletando anexo do Vercel Blob...\n');
console.log(`URL: ${url}\n`);

try {
  await del(url);
  console.log('✅ Anexo deletado com sucesso!');
  console.log('\n📝 Nota: O registro no banco de dados NÃO foi removido.');
  console.log('   Se necessário, remova também da tabela orcamento_anexo.\n');
} catch (error) {
  console.error('❌ Erro ao deletar:', error.message);
  console.error('\nPossíveis causas:');
  console.error('- Token BLOB_READ_WRITE_TOKEN não configurado');
  console.error('- URL inválida ou arquivo já deletado');
  console.error('- Sem permissão para deletar\n');
}
