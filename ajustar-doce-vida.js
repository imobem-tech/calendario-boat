import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔄 Ajustando classificação: DOCE VIDA → Contas de Terceiro rec\n');

// 1. Buscar Prestação Imóvel com DOCE VIDA
const result = await pool.query(`
  SELECT id, observacoes, classificacao, valor
  FROM bank_extratos
  WHERE tipo_importacao = 'MANUAL_OFX'
    AND empresa = 'IMOBEM'
    AND classificacao = 'Prestação Imóvel'
    AND (observacoes ILIKE '%DOCE VIDA%' OR observacoes ILIKE '%DOCE_VIDA%')
`);

console.log(`📊 Encontradas ${result.rows.length} transações com DOCE VIDA:\n`);

if (result.rows.length === 0) {
  console.log('⚠️ Nenhuma transação encontrada');
  await pool.end();
  process.exit(0);
}

result.rows.forEach(r => {
  console.log(`  [${r.id}] R$ ${r.valor} - ${r.observacoes?.substring(0, 50)}`);
});

console.log('\n🔄 Atualizando para "Contas de Terceiro rec"...\n');

// 2. Atualizar
const updateResult = await pool.query(`
  UPDATE bank_extratos
  SET classificacao = 'Contas de Terceiro rec',
      campos_extras = jsonb_set(
        campos_extras,
        '{categoria_id}',
        '33'::jsonb
      )
  WHERE tipo_importacao = 'MANUAL_OFX'
    AND empresa = 'IMOBEM'
    AND classificacao = 'Prestação Imóvel'
    AND (observacoes ILIKE '%DOCE VIDA%' OR observacoes ILIKE '%DOCE_VIDA%')
  RETURNING id, observacoes, valor
`);

console.log(`✅ Atualizadas ${updateResult.rowCount} transação(ões):\n`);

updateResult.rows.forEach(r => {
  console.log(`  [${r.id}] R$ ${r.valor} - ${r.observacoes?.substring(0, 50)}`);
});

console.log('\n========================================');
console.log('📊 RESUMO');
console.log('========================================');
console.log(`Total atualizado: ${updateResult.rowCount}`);
console.log(`De: Prestação Imóvel`);
console.log(`Para: Contas de Terceiro rec (ID 33)`);
console.log('========================================\n');

await pool.end();
