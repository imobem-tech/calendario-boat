// ============================================================
// simular_importacao_ofx.js — V.2609141750
// SIMULAÇÃO DE IMPORTAÇÃO OFX (DRY-RUN)
// Testa classificação e detecta duplicatas SEM gravar no banco
// ============================================================

import fs from 'fs';
import pkg from 'pg';
import dotenv from 'dotenv';
import { classificarLancamento } from './classificacao-automatica.js';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Parser OFX
function parseOFX(ofxContent) {
  const transactions = [];
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;

  let match;
  while ((match = stmtRegex.exec(ofxContent)) !== null) {
    const stmtContent = match[1];

    const trnType = stmtContent.match(/<TRNTYPE>(.*?)<\/TRNTYPE>/)?.[1];
    const dtPosted = stmtContent.match(/<DTPOSTED>(.*?)<\/DTPOSTED>/)?.[1];
    const trnAmt = stmtContent.match(/<TRNAMT>(.*?)<\/TRNAMT>/)?.[1];
    const fitId = stmtContent.match(/<FITID>(.*?)<\/FITID>/)?.[1];
    const checkNum = stmtContent.match(/<CHECKNUM>(.*?)<\/CHECKNUM>/)?.[1];
    const memo = stmtContent.match(/<MEMO>(.*?)<\/MEMO>/)?.[1];

    const dataFormatada = dtPosted ?
      `${dtPosted.substring(0,4)}-${dtPosted.substring(4,6)}-${dtPosted.substring(6,8)}` :
      null;

    transactions.push({
      tipo_ofx: trnType,
      data: dataFormatada,
      valor: parseFloat(trnAmt),
      fitid: fitId,
      documento: checkNum || fitId,
      descricao: memo || '',
      tipo: parseFloat(trnAmt) >= 0 ? 'CREDITO' : 'DEBITO'
    });
  }

  const acctId = ofxContent.match(/<ACCTID>(.*?)<\/ACCTID>/)?.[1];
  const bankId = ofxContent.match(/<BANKID>(.*?)<\/BANKID>/)?.[1];

  return {
    conta: acctId,
    banco: bankId,
    transacoes: transactions
  };
}

async function simularImportacao() {
  try {
    console.log('🧪 SIMULAÇÃO DE IMPORTAÇÃO OFX (DRY-RUN)\n');
    console.log('='.repeat(80));
    console.log('⚠️  NENHUM DADO SERÁ GRAVADO NO BANCO!\n');

    // Ler OFX
    const ofxPath = 'C:\\Users\\NOTEBOOK\\Downloads\\Extrato Asaas.ofx';
    const ofxContent = fs.readFileSync(ofxPath, 'latin1');
    const dados = parseOFX(ofxContent);

    console.log(`📂 Arquivo: ${ofxPath}`);
    console.log(`🏦 Banco: ${dados.banco} | Conta: ${dados.conta}`);
    console.log(`📊 Transações: ${dados.transacoes.length}\n`);

    // Buscar todas transações existentes no banco
    const fitids = dados.transacoes.map(t => t.fitid);

    const existentes = await pool.query(`
      SELECT id_transacao_banco, descricao_original, classificacao, status
      FROM bank_extratos
      WHERE empresa = 'ALLMAX'
        AND banco = 'Asaas'
        AND id_transacao_banco = ANY($1)
    `, [fitids]);

    const mapaExistentes = new Map(
      existentes.rows.map(r => [r.id_transacao_banco, r])
    );

    console.log('🔍 VERIFICAÇÃO DE DUPLICATAS:\n');
    console.log(`  ✅ Já existem no BD: ${mapaExistentes.size}`);
    console.log(`  🆕 Novas (seriam importadas): ${dados.transacoes.length - mapaExistentes.size}\n`);

    // Estatísticas
    const stats = {
      total: dados.transacoes.length,
      duplicadas: mapaExistentes.size,
      novas: dados.transacoes.length - mapaExistentes.size,
      classificadas_ok: 0,
      classificadas_pendente: 0,
      nao_classificadas: 0,
      por_tipo_ofx: {},
      por_categoria: {}
    };

    const resultados = [];

    console.log('🤖 SIMULANDO CLASSIFICAÇÃO AUTOMÁTICA...\n');
    console.log('='.repeat(80) + '\n');

    // Simular cada transação
    for (const [index, transacao] of dados.transacoes.entries()) {
      const resultado = {
        index: index + 1,
        fitid: transacao.fitid,
        data: transacao.data,
        valor: transacao.valor,
        descricao: transacao.descricao,
        tipo_ofx: transacao.tipo_ofx,
        duplicada: mapaExistentes.has(transacao.fitid),
        classificacao: null,
        status: null,
        metodo: null
      };

      // Contar por tipo OFX
      stats.por_tipo_ofx[transacao.tipo_ofx] = (stats.por_tipo_ofx[transacao.tipo_ofx] || 0) + 1;

      if (resultado.duplicada) {
        const existente = mapaExistentes.get(transacao.fitid);
        resultado.classificacao = existente.classificacao || 'SEM CLASSIFICAÇÃO';
        resultado.status = existente.status || 'DESCONHECIDO';
        resultado.metodo = 'JÁ EXISTE';
      } else {
        // SIMULAR classificação automática
        const lancamentoSimulado = {
          description: transacao.descricao,
          value: transacao.valor,
          tipo: transacao.tipo,
          empresa: 'ALLMAX',
          tipo_importacao: 'OFX',
          id_transacao_banco: transacao.fitid,
          cpfCnpjOrigem: null
        };

        try {
          const classificado = await classificarLancamento(lancamentoSimulado);

          if (classificado.categoria_id) {
            resultado.classificacao = classificado.categoria_nome;
            resultado.status = classificado.status;
            resultado.metodo = classificado.metodo;

            if (classificado.status === 'OK') {
              stats.classificadas_ok++;
            } else {
              stats.classificadas_pendente++;
            }

            // Contar por categoria
            stats.por_categoria[classificado.categoria_nome] =
              (stats.por_categoria[classificado.categoria_nome] || 0) + 1;

          } else {
            resultado.classificacao = 'NÃO CLASSIFICADO';
            resultado.status = 'PENDENTE';
            resultado.metodo = 'IA não encontrou padrão';
            stats.nao_classificadas++;
          }
        } catch (err) {
          resultado.classificacao = 'ERRO NA CLASSIFICAÇÃO';
          resultado.status = 'PENDENTE';
          resultado.metodo = err.message;
          stats.nao_classificadas++;
        }
      }

      resultados.push(resultado);

      // Mostrar progresso a cada 10
      if (resultado.index % 10 === 0) {
        console.log(`  Processadas: ${resultado.index}/${dados.transacoes.length}...`);
      }
    }

    console.log(`\n✅ Simulação concluída!\n`);
    console.log('='.repeat(80) + '\n');

    // RELATÓRIO FINAL
    console.log('📊 RELATÓRIO DA SIMULAÇÃO:\n');
    console.log(`  Total de transações no OFX: ${stats.total}`);
    console.log(`  ├─ 🔄 Duplicadas (já no BD): ${stats.duplicadas}`);
    console.log(`  └─ 🆕 Novas (seriam importadas): ${stats.novas}\n`);

    console.log('🎯 CLASSIFICAÇÃO DAS NOVAS:\n');
    console.log(`  ├─ ✅ Classificadas OK: ${stats.classificadas_ok}`);
    console.log(`  ├─ ⚠️  Classificadas PENDENTE: ${stats.classificadas_pendente}`);
    console.log(`  └─ ❌ Não classificadas: ${stats.nao_classificadas}\n`);

    console.log('📈 POR TIPO DE TRANSAÇÃO (OFX):\n');
    Object.entries(stats.por_tipo_ofx).forEach(([tipo, qtd]) => {
      console.log(`  ${tipo}: ${qtd}`);
    });

    if (Object.keys(stats.por_categoria).length > 0) {
      console.log('\n🏷️  POR CATEGORIA (Novas Classificadas):\n');
      Object.entries(stats.por_categoria)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, qtd]) => {
          console.log(`  ${cat}: ${qtd}`);
        });
    }

    // Mostrar exemplos de cada situação
    console.log('\n📋 EXEMPLOS:\n');

    const exemploDuplicada = resultados.find(r => r.duplicada);
    if (exemploDuplicada) {
      console.log('  🔄 DUPLICADA (seria ignorada):');
      console.log(`     ${exemploDuplicada.data} | R$ ${exemploDuplicada.valor.toFixed(2)}`);
      console.log(`     ${exemploDuplicada.descricao.substring(0, 60)}`);
      console.log(`     Classificação existente: ${exemploDuplicada.classificacao}\n`);
    }

    const exemploOK = resultados.find(r => !r.duplicada && r.status === 'OK');
    if (exemploOK) {
      console.log('  ✅ NOVA + CLASSIFICADA OK:');
      console.log(`     ${exemploOK.data} | R$ ${exemploOK.valor.toFixed(2)}`);
      console.log(`     ${exemploOK.descricao.substring(0, 60)}`);
      console.log(`     Categoria: ${exemploOK.classificacao} (${exemploOK.metodo})\n`);
    }

    const exemploPendente = resultados.find(r => !r.duplicada && r.status === 'PENDENTE');
    if (exemploPendente) {
      console.log('  ⚠️  NOVA + PENDENTE (precisaria revisar):');
      console.log(`     ${exemploPendente.data} | R$ ${exemploPendente.valor.toFixed(2)}`);
      console.log(`     ${exemploPendente.descricao.substring(0, 60)}`);
      console.log(`     Motivo: ${exemploPendente.metodo}\n`);
    }

    // Salvar resultados completos em JSON
    const relatorio = {
      data_simulacao: new Date().toISOString(),
      arquivo: ofxPath,
      banco: dados.banco,
      conta: dados.conta,
      estatisticas: stats,
      todas_transacoes: resultados
    };

    const outputPath = 'wpp/routes/banco/simulacao_ofx_resultado.json';
    fs.writeFileSync(outputPath, JSON.stringify(relatorio, null, 2));

    console.log('='.repeat(80) + '\n');
    console.log(`💾 Relatório completo salvo em: ${outputPath}\n`);
    console.log('⚠️  LEMBRE-SE: Esta foi apenas uma SIMULAÇÃO!');
    console.log('   Nenhum dado foi gravado no banco de dados.\n');

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await pool.end();
  }
}

simularImportacao();
