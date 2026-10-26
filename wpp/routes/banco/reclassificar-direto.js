// ============================================================
// reclassificar-direto.js — V.2610011230
// RECLASSIFICAÇÃO DIRETA (sem servidor HTTP)
//
// Reclassifica os 51 registros sem classificação
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function reclassificarDireto() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('🔄 RECLASSIFICAÇÃO AUTOMÁTICA');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const client = await pool.connect();

  try {
    // 1. Carregar categorias
    console.log('📦 1/3 - Carregando categorias...');

    const { rows: categorias } = await client.query(`
      SELECT
        id,
        nome,
        palavras_chave,
        chave_aprendida,
        tipo
      FROM bank_categorias
      WHERE ativo = true
      ORDER BY nome
    `);

    console.log(`   ✅ ${categorias.length} categorias carregadas`);
    console.log('');

    // 2. Buscar registros sem classificação
    console.log('📋 2/3 - Buscando registros sem classificação...');

    const { rows: registros } = await client.query(`
      SELECT
        id,
        empresa,
        descricao_original,
        observacoes,
        valor,
        tipo
      FROM bank_extratos
      WHERE status = 'OK'
        AND (classificacao IS NULL OR classificacao = '')
        AND (classificacao_manual IS NULL OR classificacao_manual = false)
      ORDER BY data DESC
    `);

    console.log(`   ✅ ${registros.length} registros para processar`);
    console.log('');

    // 3. Processar em memória
    console.log('🤖 3/3 - Processando reclassificação...');
    console.log('');

    let reclassificados = 0;
    let naoEncontrados = 0;

    const updates = [];

    for (const reg of registros) {
      const textoCompleto = `${reg.descricao_original || ''} ${reg.observacoes || ''}`.toLowerCase();
      let categoriaEncontrada = null;

      // Tentar match com cada categoria
      for (const cat of categorias) {
        let match = false;

        // 1. Verificar palavras_chave
        if (cat.palavras_chave) {
          const palavras = cat.palavras_chave.split(',').map(p => p.trim().toLowerCase());
          if (palavras.some(p => p && textoCompleto.includes(p))) {
            match = true;
          }
        }

        // 2. Verificar chave_aprendida
        if (!match && cat.chave_aprendida) {
          const chaves = cat.chave_aprendida.split('|');
          const frase = chaves[0]?.trim().toLowerCase();

          if (frase && textoCompleto.includes(frase)) {
            // Verificar tolerância (se tiver)
            if (chaves.length >= 3) {
              const valorChave = parseFloat(chaves[1]);
              const tolerancia = parseFloat(chaves[2]) / 100;
              const valorReg = parseFloat(reg.valor);

              const min = valorChave * (1 - tolerancia);
              const max = valorChave * (1 + tolerancia);

              if (Math.abs(valorReg) >= min && Math.abs(valorReg) <= max) {
                match = true;
              }
            } else {
              // Sem tolerância, só a frase
              match = true;
            }
          }
        }

        if (match) {
          categoriaEncontrada = cat;
          break;
        }
      }

      if (categoriaEncontrada) {
        updates.push({
          id: reg.id,
          categoria_id: categoriaEncontrada.id,
          categoria_nome: categoriaEncontrada.nome
        });
        reclassificados++;
      } else {
        naoEncontrados++;
      }
    }

    console.log(`   ✅ ${reclassificados} registros classificados`);
    console.log(`   ⚠️ ${naoEncontrados} sem categoria correspondente`);
    console.log('');

    // 4. Aplicar updates em batch
    if (updates.length > 0) {
      console.log('💾 Salvando classificações no banco...');

      await client.query('BEGIN');

      const ids = updates.map(u => u.id);
      const categoriaIds = updates.map(u => u.categoria_id);

      await client.query(`
        UPDATE bank_extratos AS e
        SET classificacao = u.categoria_id::TEXT,
            classificado_em = NOW(),
            classificacao_manual = false
        FROM (
          SELECT unnest($1::INTEGER[]) AS id,
                 unnest($2::INTEGER[]) AS categoria_id
        ) AS u
        WHERE e.id = u.id
          AND (e.classificacao IS NULL OR e.classificacao = '')
          AND (e.classificacao_manual IS NULL OR e.classificacao_manual = false)
      `, [ids, categoriaIds]);

      await client.query('COMMIT');

      console.log(`   ✅ ${updates.length} registros atualizados no banco`);
      console.log('');

      // Mostrar alguns exemplos
      console.log('📝 Exemplos de classificações aplicadas:');
      updates.slice(0, 5).forEach((u, i) => {
        console.log(`   ${i + 1}. ID ${u.id} → ${u.categoria_nome}`);
      });
      console.log('');
    }

    // 5. Verificar resultado final
    const { rows: [{ restantes }] } = await client.query(`
      SELECT COUNT(*) as restantes
      FROM bank_extratos
      WHERE status = 'OK'
        AND (classificacao IS NULL OR classificacao = '')
    `);

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ RECLASSIFICAÇÃO CONCLUÍDA');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log(`   📊 Classificados: ${reclassificados}`);
    console.log(`   ⚠️ Restantes sem classificação: ${restantes}`);
    console.log('');

    if (parseInt(restantes) > 0) {
      console.log('💡 PRÓXIMO PASSO:');
      console.log(`   ${restantes} registros precisam de classificação MANUAL`);
      console.log('   Acesse o sistema para classificá-los manualmente');
      console.log('');
    }

    await pool.end();

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

reclassificarDireto();

// ============================================================
// FIM
// ============================================================
