import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

const sql = fs.readFileSync('fix_previsao_duplicada.sql', 'utf8');

console.log('📦 Criando tabela de controle de duplicatas...\n');

try {
  await pool.query(sql);
  console.log('✅ Tabela wpp_previsao_enviada criada!');
  console.log('✅ Função ja_enviou_previsao() criada!');
  console.log('✅ Função registrar_envio_previsao() criada!\n');
} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}
