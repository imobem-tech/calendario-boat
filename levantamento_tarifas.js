// ============================================================
// LEVANTAMENTO: Tarifas Bancárias (valores pequenos)
// V.2610071755
// ============================================================
//
// OBJETIVO:
// Identificar lançamentos negativos pequenos (-R$ 1,99 a -R$ 0,01)
// para classificar como "Taxa Bancária" / "Tarifa Bancária"
//
// CRITÉRIOS:
// - valor < 0 (negativos)
// - valor >= -1.99 (maiores ou iguais a -R$ 1,99)
// - Não classificados OU classificados incorretamente
// ============================================================

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function levantamentoTarifas() {
  try {
    console.log('🔍 LEVANTAMENTO - Tarifas Bancárias');
    console.log('='.repeat(70));
    console.log('');

    // =========================================================
    // 1. VERIFICAR SE EXISTE CATEGORIA "TAXA BANCÁRIA"
    // =========================================================
    console.log('1️⃣ Verificando categoria "Taxa Bancária"...\n');

    const queryCat = `
      SELECT id, nome, empresa, tipo, icone
      FROM bank_categorias
      WHERE LOWER(nome) LIKE '%taxa%' OR LOWER(nome) LIKE '%tarifa%'
      ORDER BY empresa, nome
    `;

    const resCat = await pool.query(queryCat);

    if (resCat.rows.length === 0) {
      console.log('❌ ATENÇÃO: Nenhuma categoria de taxa/tarifa encontrada!');
      console.log('   Será necessário criar ou informar o ID da categoria.');
    } else {
      console.log(`✅ Categorias encontradas: ${resCat.rows.length}\n`);
      console.table(resCat.rows);
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('');

    // =========================================================
    // 2. LEVANTAR LANÇAMENTOS QUE SERÃO CLASSIFICADOS
    // =========================================================
    console.log('2️⃣ Levantando lançamentos a classificar...\n');

    const queryLanc = `
      SELECT
        e.id,
        e.empresa,
        e.data::DATE as data,
        e.valor,
        e.descricao_original,
        e.classificacao,
        c.nome as categoria_atual,
        e.status
      FROM bank_extratos e
      LEFT JOIN bank_categorias c ON (
        CASE
          WHEN e.classificacao ~ '^[0-9]+$' THEN e.classificacao::INTEGER
          ELSE NULL
        END = c.id
      )
      WHERE e.valor < 0              -- Negativos (débitos)
        AND e.valor >= -1.99         -- Entre -R$ 1,99 e -R$ 0,01
      ORDER BY e.empresa, e.data DESC, e.valor
    `;

    const resLanc = await pool.query(queryLanc);

    console.log(`📊 TOTAL: ${resLanc.rows.length} lançamentos encontrados\n`);

    if (resLanc.rows.length === 0) {
      console.log('✅ Nenhum lançamento encontrado com esses critérios.');
      return;
    }

    // Agrupar por empresa
    const porEmpresa = {};
    resLanc.rows.forEach(row => {
      if (!porEmpresa[row.empresa]) {
        porEmpresa[row.empresa] = {
          total: 0,
          valores: [],
          registros: []
        };
      }
      porEmpresa[row.empresa].total++;
      porEmpresa[row.empresa].valores.push(parseFloat(row.valor));
      porEmpresa[row.empresa].registros.push(row);
    });

    // Mostrar resumo por empresa
    console.log('📋 RESUMO POR EMPRESA:');
    console.log('-'.repeat(70));
    Object.keys(porEmpresa).forEach(emp => {
      const dados = porEmpresa[emp];
      const somaTotal = dados.valores.reduce((a, b) => a + b, 0);
      const menorValor = Math.min(...dados.valores);
      const maiorValor = Math.max(...dados.valores);

      console.log(`\n🏢 ${emp}:`);
      console.log(`   Total de lançamentos: ${dados.total}`);
      console.log(`   Soma total: R$ ${somaTotal.toFixed(2)}`);
      console.log(`   Menor valor: R$ ${menorValor.toFixed(2)}`);
      console.log(`   Maior valor: R$ ${maiorValor.toFixed(2)}`);
    });

    console.log('');
    console.log('='.repeat(70));
    console.log('');

    // Mostrar amostra dos primeiros 20 registros
    console.log('📄 AMOSTRA (primeiros 20 registros):');
    console.log('-'.repeat(70));
    console.table(
      resLanc.rows.slice(0, 20).map(r => ({
        ID: r.id,
        Empresa: r.empresa,
        Data: r.data,
        Valor: `R$ ${parseFloat(r.valor).toFixed(2)}`,
        Descrição: r.descricao_original.substring(0, 40),
        'Cat. Atual': r.categoria_atual || '(sem categoria)',
        Status: r.status || 'NULL'
      }))
    );

    if (resLanc.rows.length > 20) {
      console.log(`\n... e mais ${resLanc.rows.length - 20} registros.`);
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('');

    // =========================================================
    // 3. VERIFICAR QUANTOS JÁ ESTÃO CLASSIFICADOS
    // =========================================================
    console.log('3️⃣ Status de classificação atual:\n');

    const jaClassificados = resLanc.rows.filter(r => r.classificacao && r.classificacao !== '').length;
    const naoClassificados = resLanc.rows.length - jaClassificados;

    console.log(`✅ Já classificados: ${jaClassificados} (${((jaClassificados / resLanc.rows.length) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Não classificados: ${naoClassificados} (${((naoClassificados / resLanc.rows.length) * 100).toFixed(1)}%)`);

    console.log('');
    console.log('='.repeat(70));
    console.log('');

    // =========================================================
    // RESUMO FINAL
    // =========================================================
    console.log('📊 RESUMO FINAL:');
    console.log('-'.repeat(70));
    console.log(`Total de registros a classificar: ${resLanc.rows.length}`);
    console.log(`Empresas afetadas: ${Object.keys(porEmpresa).join(', ')}`);
    console.log(`Valor total: R$ ${resLanc.rows.reduce((sum, r) => sum + parseFloat(r.valor), 0).toFixed(2)}`);
    console.log('');
    console.log('⚠️  AÇÃO NECESSÁRIA:');
    console.log('1. Verificar se as categorias de "Taxa Bancária" existem');
    console.log('2. Confirmar os IDs das categorias por empresa');
    console.log('3. Executar script de atualização em lote');
    console.log('');

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

// Executar
levantamentoTarifas();
