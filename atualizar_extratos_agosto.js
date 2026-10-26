// V.261001142000
// Script para atualizar extratos bancários anteriores a 01/09/2026
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function atualizarExtratos() {
  try {
    // 1. Listar os registros que serão afetados
    const verificacao = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN tipo = 'DEBITO' THEN 1 END) as debitos,
        COUNT(CASE WHEN tipo = 'CREDITO' THEN 1 END) as creditos,
        COUNT(CASE WHEN tipo IS NULL OR tipo NOT IN ('DEBITO', 'CREDITO') THEN 1 END) as outros,
        SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END) as total_debitos,
        SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END) as total_creditos
      FROM bank_extratos
      WHERE data < '2026-09-01'
        AND (status = 'PENDENTE' OR classificacao IS NULL)
    `);

    console.log('=== REGISTROS QUE SERÃO ATUALIZADOS (< 01/09/2026) ===\n');
    console.log(`Total de registros: ${verificacao.rows[0].total}`);
    console.log(`  - DÉBITOS: ${verificacao.rows[0].debitos} (R$ ${parseFloat(verificacao.rows[0].total_debitos || 0).toFixed(2)})`);
    console.log(`  - CRÉDITOS: ${verificacao.rows[0].creditos} (R$ ${parseFloat(verificacao.rows[0].total_creditos || 0).toFixed(2)})`);
    console.log(`  - OUTROS/NULL: ${verificacao.rows[0].outros}\n`);

    if (verificacao.rows[0].total === 0) {
      console.log('Nenhum registro para atualizar.');
      await pool.end();
      return;
    }

    // 2. Mostrar alguns exemplos
    const exemplos = await pool.query(`
      SELECT id, data, descricao_original, tipo, valor, status, classificacao
      FROM bank_extratos
      WHERE data < '2026-09-01'
        AND (status = 'PENDENTE' OR classificacao IS NULL)
      ORDER BY data DESC
      LIMIT 10
    `);

    console.log('=== EXEMPLOS (últimos 10) ===\n');
    exemplos.rows.forEach((item, index) => {
      console.log(`${index + 1}. [${item.id}] ${item.data.toISOString().split('T')[0]} | ${item.tipo || 'NULL'} | R$ ${parseFloat(item.valor).toFixed(2)}`);
      console.log(`   ${item.descricao_original}`);
      console.log(`   Status atual: ${item.status || 'NULL'} | Classificação: ${item.classificacao || 'NULL'}\n`);
    });

    // 3. Executar as atualizações
    console.log('=== INICIANDO ATUALIZAÇÃO ===\n');

    // Atualizar DÉBITOS
    const updateDebitos = await pool.query(`
      UPDATE bank_extratos
      SET
        classificacao = '38',
        status = 'OK',
        classificado_em = NOW(),
        classificado_por = 'SCRIPT_AGOSTO_2026'
      WHERE data < '2026-09-01'
        AND (status = 'PENDENTE' OR classificacao IS NULL)
        AND tipo = 'DEBITO'
      RETURNING id
    `);

    console.log(`✓ DÉBITOS atualizados: ${updateDebitos.rowCount} registros → Categoria 38 (Operação Falhou D)`);

    // Atualizar CRÉDITOS
    const updateCreditos = await pool.query(`
      UPDATE bank_extratos
      SET
        classificacao = '37',
        status = 'OK',
        classificado_em = NOW(),
        classificado_por = 'SCRIPT_AGOSTO_2026'
      WHERE data < '2026-09-01'
        AND (status = 'PENDENTE' OR classificacao IS NULL)
        AND tipo = 'CREDITO'
      RETURNING id
    `);

    console.log(`✓ CRÉDITOS atualizados: ${updateCreditos.rowCount} registros → Categoria 37 (Operação Falhou C)`);

    // Lidar com registros sem tipo definido (se houver)
    const semTipo = await pool.query(`
      SELECT COUNT(*) as total
      FROM bank_extratos
      WHERE data < '2026-09-01'
        AND (status = 'PENDENTE' OR classificacao IS NULL)
        AND (tipo IS NULL OR tipo NOT IN ('DEBITO', 'CREDITO'))
    `);

    if (parseInt(semTipo.rows[0].total) > 0) {
      console.log(`\n⚠️  ATENÇÃO: ${semTipo.rows[0].total} registros SEM TIPO definido não foram atualizados.`);
      console.log('   Estes precisam ter o campo "tipo" definido como DEBITO ou CREDITO primeiro.');
    }

    console.log('\n=== ATUALIZAÇÃO CONCLUÍDA ===');
    console.log(`Total processado: ${updateDebitos.rowCount + updateCreditos.rowCount} registros`);

    await pool.end();
  } catch (error) {
    console.error('❌ Erro ao atualizar:', error);
    await pool.end();
    process.exit(1);
  }
}

atualizarExtratos();
