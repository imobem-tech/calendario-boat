// ============================================================
// ATUALIZAÇÃO: Classificar Tarifas Bancárias em Lote
// V.2610071800
// ============================================================
//
// AÇÃO:
// Atualizar 1.837 lançamentos (valores entre -R$ 1,99 e -R$ 0,01)
// para categoria "Taxa Bancária" (ID: 25)
//
// EMPRESAS: ALLMAX (1.683) + IMOBEM (154)
// VALOR TOTAL: -R$ 1.150,92
// ============================================================

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function atualizarTarifas() {
  const client = await pool.connect();

  try {
    console.log('🔧 ATUALIZAÇÃO EM LOTE - Tarifas Bancárias');
    console.log('='.repeat(70));
    console.log('');

    // Iniciar transação
    await client.query('BEGIN');

    // =========================================================
    // 1. BACKUP DOS DADOS ANTES DA ATUALIZAÇÃO
    // =========================================================
    console.log('1️⃣ Criando backup dos registros...\n');

    const queryBackup = `
      CREATE TEMP TABLE backup_tarifas_${Date.now()} AS
      SELECT *
      FROM bank_extratos
      WHERE valor < 0 AND valor >= -1.99
    `;

    await client.query(queryBackup);
    console.log('✅ Backup criado na tabela temporária\n');

    // =========================================================
    // 2. CONTAR REGISTROS ANTES
    // =========================================================
    const queryCount = `
      SELECT COUNT(*) as total
      FROM bank_extratos
      WHERE valor < 0 AND valor >= -1.99
    `;

    const resCount = await client.query(queryCount);
    const totalAntes = parseInt(resCount.rows[0].total);

    console.log(`📊 Total de registros a atualizar: ${totalAntes}\n`);

    // =========================================================
    // 3. EXECUTAR ATUALIZAÇÃO
    // =========================================================
    console.log('2️⃣ Executando atualização em lote...\n');

    const queryUpdate = `
      UPDATE bank_extratos
      SET
        classificacao = '25',           -- Taxa Bancária
        status = 'OK',                  -- Marcar como classificado
        classificacao_manual = FALSE    -- Atualização automática
      WHERE valor < 0                   -- Negativos
        AND valor >= -1.99              -- Entre -R$ 1,99 e -R$ 0,01
      RETURNING id, empresa, valor, descricao_original
    `;

    console.log('⏳ Atualizando registros...');
    const resUpdate = await client.query(queryUpdate);

    console.log(`✅ ${resUpdate.rows.length} registros atualizados!\n`);

    // =========================================================
    // 4. RESUMO DA ATUALIZAÇÃO
    // =========================================================
    console.log('='.repeat(70));
    console.log('3️⃣ Resumo da atualização:\n');

    // Agrupar por empresa
    const porEmpresa = {};
    resUpdate.rows.forEach(row => {
      if (!porEmpresa[row.empresa]) {
        porEmpresa[row.empresa] = {
          total: 0,
          valor_total: 0
        };
      }
      porEmpresa[row.empresa].total++;
      porEmpresa[row.empresa].valor_total += parseFloat(row.valor);
    });

    Object.keys(porEmpresa).forEach(emp => {
      const dados = porEmpresa[emp];
      console.log(`🏢 ${emp}:`);
      console.log(`   Registros atualizados: ${dados.total}`);
      console.log(`   Valor total: R$ ${dados.valor_total.toFixed(2)}`);
      console.log('');
    });

    // =========================================================
    // 5. VERIFICAÇÃO PÓS-ATUALIZAÇÃO
    // =========================================================
    console.log('='.repeat(70));
    console.log('4️⃣ Verificando resultado...\n');

    const queryVerifica = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN classificacao = '25' THEN 1 END) as com_taxa_bancaria,
        COUNT(CASE WHEN status = 'OK' THEN 1 END) as com_status_ok
      FROM bank_extratos
      WHERE valor < 0 AND valor >= -1.99
    `;

    const resVerifica = await client.query(queryVerifica);
    const verifica = resVerifica.rows[0];

    console.log(`Total de registros no critério: ${verifica.total}`);
    console.log(`Com categoria "Taxa Bancária": ${verifica.com_taxa_bancaria} (${((verifica.com_taxa_bancaria / verifica.total) * 100).toFixed(1)}%)`);
    console.log(`Com status OK: ${verifica.com_status_ok} (${((verifica.com_status_ok / verifica.total) * 100).toFixed(1)}%)`);
    console.log('');

    if (verifica.com_taxa_bancaria === verifica.total) {
      console.log('✅ SUCESSO: Todos os registros foram classificados corretamente!\n');
    } else {
      console.log('⚠️  ATENÇÃO: Alguns registros não foram atualizados.\n');
    }

    // =========================================================
    // 6. COMMIT
    // =========================================================
    console.log('='.repeat(70));
    console.log('5️⃣ Finalizando...\n');

    await client.query('COMMIT');

    console.log('✅ COMMIT realizado com sucesso!');
    console.log('✅ Atualização concluída!');
    console.log('');
    console.log('='.repeat(70));
    console.log('');
    console.log('📊 RESULTADO FINAL:');
    console.log(`   ${resUpdate.rows.length} registros classificados como "Taxa Bancária"`);
    console.log(`   Categoria ID: 25`);
    console.log(`   Status: OK`);
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('❌ ERRO! Rollback executado.');
    console.error('❌ Nenhuma alteração foi feita no banco.');
    console.error('');
    console.error('Erro:', err.message);
    console.error('');
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar
console.log('');
console.log('⚠️  ATENÇÃO: Esta operação irá atualizar 1.837 registros!');
console.log('');
console.log('Aguarde...');
console.log('');

atualizarTarifas();
