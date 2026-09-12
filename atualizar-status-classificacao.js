import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔍 Verificando status_classificacao na tabela bank_extratos\n');

// 1. Verificar se o campo existe
try {
  const schemaCheck = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'bank_extratos'
      AND column_name = 'status_classificacao'
  `);

  if (schemaCheck.rows.length === 0) {
    console.log('⚠️ Campo status_classificacao não existe na tabela');
    console.log('Criando campo...\n');

    await pool.query(`
      ALTER TABLE bank_extratos
      ADD COLUMN status_classificacao VARCHAR(20) DEFAULT 'PENDENTE'
    `);

    console.log('✅ Campo status_classificacao criado!\n');
  } else {
    console.log('✅ Campo status_classificacao existe\n');
  }

  // 2. Ver quantos registros têm classificação mas status PENDENTE
  const pendentes = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status_classificacao = 'PENDENTE' OR status_classificacao IS NULL) as pendentes,
      COUNT(*) FILTER (WHERE status_classificacao = 'OK') as ok
    FROM bank_extratos
    WHERE classificacao IS NOT NULL
  `);

  console.log('📊 Situação atual dos registros COM classificação:\n');
  console.log(`  Total: ${pendentes.rows[0].total}`);
  console.log(`  ✅ OK: ${pendentes.rows[0].ok}`);
  console.log(`  ⏳ PENDENTE/NULL: ${pendentes.rows[0].pendentes}`);
  console.log('');

  if (pendentes.rows[0].pendentes > 0) {
    console.log('🔄 Atualizando registros para status_classificacao = OK...\n');

    const updateResult = await pool.query(`
      UPDATE bank_extratos
      SET status_classificacao = 'OK'
      WHERE classificacao IS NOT NULL
        AND (status_classificacao = 'PENDENTE' OR status_classificacao IS NULL)
      RETURNING id, classificacao, status_classificacao
    `);

    console.log(`✅ Atualizados ${updateResult.rowCount} registro(s)\n`);

    // Mostrar alguns exemplos
    if (updateResult.rowCount > 0) {
      console.log('Exemplos atualizados:');
      updateResult.rows.slice(0, 5).forEach(r => {
        console.log(`  [${r.id}] ${r.classificacao} → ${r.status_classificacao}`);
      });
      if (updateResult.rowCount > 5) {
        console.log(`  ... e mais ${updateResult.rowCount - 5} registros`);
      }
      console.log('');
    }
  } else {
    console.log('✅ Todos os registros com classificação já estão com status_classificacao = OK\n');
  }

  // 3. Verificar situação final
  const final = await pool.query(`
    SELECT
      status_classificacao,
      COUNT(*) as quantidade
    FROM bank_extratos
    WHERE classificacao IS NOT NULL
    GROUP BY status_classificacao
    ORDER BY status_classificacao
  `);

  console.log('========================================');
  console.log('📊 SITUAÇÃO FINAL');
  console.log('========================================');
  console.log('Registros COM classificação:\n');
  final.rows.forEach(r => {
    console.log(`  ${r.status_classificacao || 'NULL'}: ${r.quantidade}`);
  });

  // 4. Ver quantos ainda estão sem classificação
  const semClass = await pool.query(`
    SELECT COUNT(*) as total
    FROM bank_extratos
    WHERE classificacao IS NULL
  `);

  console.log('');
  console.log('Registros SEM classificação:');
  console.log(`  Total: ${semClass.rows[0].total}`);
  console.log('========================================\n');

} catch (err) {
  console.error('❌ Erro:', err.message);
}

await pool.end();
