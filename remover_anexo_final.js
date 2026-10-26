import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const url = 'https://opwohb5ckmiwk75r.public.blob.vercel-storage.com/orcamentos/51/orc_51_1792931533791.pdf';

console.log('🔍 Buscando anexo no banco de dados...\n');

try {
  // 1. Buscar o anexo
  const busca = await pool.query(`
    SELECT 
      id_anexo,
      id_orcamento,
      nome_arquivo,
      url,
      tamanho_bytes,
      tipo_arquivo,
      nome_amigavel
    FROM orcamento_anexo
    WHERE url = $1
  `, [url]);

  if (busca.rows.length === 0) {
    console.log('⚠️  Anexo não encontrado no banco de dados.');
    console.log('   Provavelmente já foi removido anteriormente.\n');
    await pool.end();
    process.exit(0);
  }

  const anexo = busca.rows[0];
  console.log('✅ Anexo encontrado:\n');
  console.log(`   ID Anexo: ${anexo.id_anexo}`);
  console.log(`   ID Orçamento: ${anexo.id_orcamento}`);
  console.log(`   Nome: ${anexo.nome_arquivo}`);
  console.log(`   Nome Amigável: ${anexo.nome_amigavel || '(sem nome)'}`);
  console.log(`   Tamanho: ${(anexo.tamanho_bytes / 1024).toFixed(2)} KB`);
  console.log(`   Tipo: ${anexo.tipo_arquivo}\n`);

  // 2. Adicionar log no orçamento ANTES de deletar
  console.log('📝 Adicionando log no orçamento...\n');
  
  await pool.query(`
    INSERT INTO orcamento_log (
      id_orcamento,
      acao,
      descricao,
      data_hora
    ) VALUES (
      $1,
      'ANEXO_REMOVIDO',
      $2,
      NOW() AT TIME ZONE 'America/Sao_Paulo'
    )
  `, [
    anexo.id_orcamento,
    `Anexo removido: ${anexo.nome_amigavel || anexo.nome_arquivo} (${(anexo.tamanho_bytes / 1024).toFixed(2)} KB)`
  ]);

  console.log('✅ Log adicionado!\n');

  // 3. Deletar do banco
  console.log('🗑️  Removendo do banco de dados...\n');
  
  await pool.query(`
    DELETE FROM orcamento_anexo
    WHERE id_anexo = $1
  `, [anexo.id_anexo]);

  console.log('✅ Anexo removido do banco de dados!\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ PROCESSO CONCLUÍDO COM SUCESSO!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Resumo:');
  console.log('• Arquivo deletado do Vercel Blob ✅');
  console.log('• Log adicionado no orçamento ✅');
  console.log('• Registro removido do banco ✅\n');

  await pool.end();

} catch (error) {
  console.error('❌ Erro:', error.message);
  await pool.end();
  process.exit(1);
}
