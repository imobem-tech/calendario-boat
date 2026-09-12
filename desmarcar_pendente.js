import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // Desmarcar classificação do ID 24
    const result = await pool.query(`
      UPDATE bank_extratos
      SET
        classificacao = NULL,
        classificacao_manual = false,
        classificado_por = NULL,
        classificado_em = NULL,
        status_classificacao = 'PENDENTE',
        confianca = NULL,
        observacoes = NULL,
        recibos_urls = '[]'::jsonb
      WHERE id = 24
      RETURNING id, empresa, data, valor, descricao_original, status_classificacao
    `);

    if (result.rows.length === 0) {
      console.log('❌ Lançamento ID 24 não encontrado');
    } else {
      console.log('✅ Lançamento ID 24 desmarcado para PENDENTE!');
      console.log('\n📋 Dados:');
      console.table(result.rows);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
