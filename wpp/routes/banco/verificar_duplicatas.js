import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: 'C:/Users/NOTEBOOK/projetos/calendario_allmax/.env' });

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verificar() {
  try {
    // Buscar lançamento de 01/08 R$ 48.24 (do OFX que vimos)
    const result = await pool.query(`
      SELECT
        id,
        empresa,
        data,
        valor,
        LEFT(descricao_original, 50) as descricao,
        id_transacao_banco,
        tipo_importacao,
        hash_unico
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND data = '2026-08-01'
        AND ABS(valor - 48.24) < 0.01
      ORDER BY importado_em DESC
      LIMIT 5
    `);

    console.log('\n📊 Lançamentos de R$ 48.24 em 01/08/2026:\n');
    console.log('TIPO_IMPORT | ID_TRANSACAO_BANCO | HASH_UNICO');
    console.log('─'.repeat(80));

    result.rows.forEach(row => {
      console.log(`${row.tipo_importacao?.padEnd(12)} | ${row.id_transacao_banco?.padEnd(20)} | ${row.hash_unico?.substring(0,16)}...`);
    });

    console.log('\n🔍 Comparação FITID do OFX vs ID do Webhook:');
    console.log('   FITID do OFX: 1983754837');
    console.log('   ID do Webhook:', result.rows.find(r => r.tipo_importacao === 'WEBHOOK')?.id_transacao_banco || 'NÃO ENCONTRADO');

    await pool.end();
  } catch (err) {
    console.error('Erro:', err.message);
    await pool.end();
  }
}

verificar();
