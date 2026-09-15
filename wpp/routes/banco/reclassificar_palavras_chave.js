// ============================================================
// reclassificar_palavras_chave.js — V.2609142045
// RECLASSIFICADOR AUTOMÁTICO POR PALAVRAS-CHAVE
// Reaplicar regras de classificação após adicionar novas palavras
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const CONFIG = {
  // Filtros (altere conforme necessário)
  empresa: 'ALLMAX',              // null = todas as empresas
  banco: 'Asaas',                 // null = todos os bancos

  // Modos de operação
  modo: 'NAO_CLASSIFICADOS',      // 'NAO_CLASSIFICADOS' ou 'TODOS'

  // Período (opcional)
  dataInicio: null,               // '2026-09-01' ou null
  dataFim: null,                  // '2026-09-30' ou null

  // Opções
  sobrescrever: false,            // true = reclassificar mesmo os já classificados
  atualizarStatus: true           // true = mudar status para 'OK' quando classificar
};

// ============================================================
// FUNÇÕES
// ============================================================

// Classificar automaticamente usando regras
async function classificarAutomaticamente(texto, empresa) {
  if (!texto) return null;

  const regras = await pool.query(`
    SELECT id, nome_regra, classificacao, palavras_chave, prioridade
    FROM bank_regras_classificacao
    WHERE ativa = true
      AND ativo = true
      AND (empresa = $1 OR empresa IS NULL)
    ORDER BY prioridade DESC, id ASC
  `, [empresa]);

  const textoLower = texto.toLowerCase();

  for (const regra of regras.rows) {
    if (!regra.palavras_chave) continue;

    const palavras = regra.palavras_chave.split(',').map(p => p.trim().toLowerCase());

    // Verificar se alguma palavra-chave está presente
    if (palavras.some(palavra => textoLower.includes(palavra))) {
      return {
        classificacao: regra.classificacao,
        regra_id: regra.id,
        regra_nome: regra.nome_regra,
        palavra_encontrada: palavras.find(p => textoLower.includes(p))
      };
    }
  }

  return null;
}

// ============================================================
// PROCESSADOR PRINCIPAL
// ============================================================

async function reclassificar() {
  try {
    console.log('\n🔄 RECLASSIFICADOR AUTOMÁTICO POR PALAVRAS-CHAVE\n');
    console.log('='.repeat(80) + '\n');

    console.log('📋 CONFIGURAÇÃO:\n');
    console.log(`  Empresa: ${CONFIG.empresa || 'TODAS'}`);
    console.log(`  Banco: ${CONFIG.banco || 'TODOS'}`);
    console.log(`  Modo: ${CONFIG.modo}`);
    console.log(`  Período: ${CONFIG.dataInicio || 'sem filtro'} até ${CONFIG.dataFim || 'sem filtro'}`);
    console.log(`  Sobrescrever: ${CONFIG.sobrescrever ? 'SIM' : 'NÃO'}`);
    console.log(`  Atualizar status: ${CONFIG.atualizarStatus ? 'SIM' : 'NÃO'}\n`);

    console.log('='.repeat(80) + '\n');

    // Construir query com filtros
    let whereClause = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (CONFIG.empresa) {
      whereClause.push(`empresa = $${paramIndex++}`);
      params.push(CONFIG.empresa);
    }

    if (CONFIG.banco) {
      whereClause.push(`banco = $${paramIndex++}`);
      params.push(CONFIG.banco);
    }

    if (CONFIG.dataInicio) {
      whereClause.push(`data >= $${paramIndex++}`);
      params.push(CONFIG.dataInicio);
    }

    if (CONFIG.dataFim) {
      whereClause.push(`data <= $${paramIndex++}`);
      params.push(CONFIG.dataFim);
    }

    // Modo: apenas não classificados ou todos
    if (CONFIG.modo === 'NAO_CLASSIFICADOS') {
      whereClause.push(`(classificacao IS NULL OR classificacao = '' OR status != 'OK')`);
    }

    // Buscar registros
    const query = `
      SELECT
        id,
        empresa,
        data,
        valor,
        descricao_original,
        observacoes,
        classificacao,
        status
      FROM bank_extratos
      WHERE ${whereClause.join(' AND ')}
      ORDER BY data, id
    `;

    console.log('🔍 Buscando registros...\n');

    const registros = await pool.query(query, params);

    console.log(`📊 Total de registros encontrados: ${registros.rows.length}\n`);

    if (registros.rows.length === 0) {
      console.log('✅ Nenhum registro para reclassificar!\n');
      return;
    }

    console.log('='.repeat(80) + '\n');
    console.log('🔄 PROCESSANDO...\n');

    const stats = {
      processados: 0,
      reclassificados: 0,
      mantidos: 0,
      semRegra: 0,
      erros: 0,
      porRegra: {}
    };

    for (const reg of registros.rows) {
      try {
        stats.processados++;

        // Texto para classificar (prioriza observacoes, senão usa descricao_original)
        const texto = reg.observacoes || reg.descricao_original;

        if (!texto) {
          stats.semRegra++;
          continue;
        }

        // Classificar
        const resultado = await classificarAutomaticamente(texto, reg.empresa);

        if (!resultado) {
          stats.semRegra++;

          if (stats.processados % 50 === 0) {
            console.log(`  Processados: ${stats.processados}/${registros.rows.length}...`);
          }
          continue;
        }

        // Verificar se deve sobrescrever
        if (reg.classificacao && reg.classificacao !== '' && !CONFIG.sobrescrever) {
          // Já tem classificação e não deve sobrescrever
          if (reg.classificacao === resultado.classificacao) {
            stats.mantidos++;
          } else {
            stats.mantidos++;
          }

          if (stats.processados % 50 === 0) {
            console.log(`  Processados: ${stats.processados}/${registros.rows.length}...`);
          }
          continue;
        }

        // Atualizar registro
        const statusNovo = CONFIG.atualizarStatus ? 'OK' : reg.status;

        await pool.query(`
          UPDATE bank_extratos
          SET
            classificacao = $1,
            status = $2,
            classificado_em = NOW()
          WHERE id = $3
        `, [resultado.classificacao, statusNovo, reg.id]);

        stats.reclassificados++;

        // Contar por regra
        if (!stats.porRegra[resultado.regra_nome]) {
          stats.porRegra[resultado.regra_nome] = 0;
        }
        stats.porRegra[resultado.regra_nome]++;

        // Log a cada 50 registros ou se for importante
        if (stats.processados % 50 === 0) {
          console.log(`  Processados: ${stats.processados}/${registros.rows.length} | Reclassificados: ${stats.reclassificados}`);
        }

      } catch (err) {
        console.error(`  ❌ Erro ao processar ID ${reg.id}:`, err.message);
        stats.erros++;
      }
    }

    // Relatório final
    console.log('\n' + '='.repeat(80) + '\n');
    console.log('📊 RELATÓRIO FINAL:\n');
    console.log(`  Total processados: ${stats.processados}`);
    console.log(`  ✅ Reclassificados: ${stats.reclassificados}`);
    console.log(`  ⏭️  Mantidos (já classificados): ${stats.mantidos}`);
    console.log(`  ⚠️  Sem regra aplicável: ${stats.semRegra}`);
    console.log(`  ❌ Erros: ${stats.erros}\n`);

    if (stats.reclassificados > 0) {
      console.log('📋 RECLASSIFICADOS POR REGRA:\n');

      const regrasSorted = Object.entries(stats.porRegra)
        .sort((a, b) => b[1] - a[1]);

      regrasSorted.forEach(([regra, qtd]) => {
        console.log(`  ${regra.padEnd(40)} : ${qtd.toString().padStart(4)} registros`);
      });
      console.log('');
    }

    // Estatísticas adicionais
    console.log('='.repeat(80) + '\n');
    console.log('📈 ESTATÍSTICAS GERAIS:\n');

    const statsGerais = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN classificacao IS NOT NULL AND classificacao != '' THEN 1 END) as classificados,
        COUNT(CASE WHEN status = 'OK' THEN 1 END) as ok
      FROM bank_extratos
      WHERE ${whereClause.join(' AND ')}
    `, params);

    const { total, classificados, ok } = statsGerais.rows[0];

    console.log(`  Total de registros (filtros aplicados): ${total}`);
    console.log(`  Com classificação: ${classificados} (${(classificados/total*100).toFixed(1)}%)`);
    console.log(`  Com status OK: ${ok} (${(ok/total*100).toFixed(1)}%)\n`);

    console.log('='.repeat(80) + '\n');
    console.log('✅ RECLASSIFICAÇÃO CONCLUÍDA!\n');

  } catch (err) {
    console.error('❌ Erro fatal:', err);
  } finally {
    await pool.end();
  }
}

reclassificar();
