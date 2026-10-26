// ============================================================
// listar-pendentes-classificacao.js — V.2610011235
// LISTA DE REGISTROS PENDENTES DE CLASSIFICAÇÃO MANUAL
//
// Gera CSV com os 37 registros que precisam ser classificados
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function gerarListaPendentes() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('📋 REGISTROS PENDENTES DE CLASSIFICAÇÃO MANUAL');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  try {
    // Buscar registros sem classificação
    const { rows: pendentes } = await pool.query(`
      SELECT
        id,
        empresa,
        data,
        descricao_original,
        valor,
        tipo,
        cpf_cnpj_origem,
        nome_origem,
        observacoes,
        recibos_urls,
        CASE
          WHEN recibos_urls IS NOT NULL AND jsonb_array_length(recibos_urls) > 0
          THEN jsonb_array_length(recibos_urls)
          ELSE 0
        END as qtd_anexos
      FROM bank_extratos
      WHERE status = 'OK'
        AND (classificacao IS NULL OR classificacao = '')
      ORDER BY data DESC
    `);

    console.log(`📊 Total de registros: ${pendentes.length}`);
    console.log('');

    if (pendentes.length === 0) {
      console.log('✅ Todos os registros estão classificados!');
      await pool.end();
      return;
    }

    // Gerar CSV
    const linhasCSV = [];

    // Cabeçalho
    linhasCSV.push([
      'ID',
      'Empresa',
      'Data',
      'Descrição',
      'Valor',
      'Tipo',
      'CPF/CNPJ',
      'Nome',
      'Observações',
      'Qtd Anexos'
    ].join(';'));

    // Dados
    pendentes.forEach(r => {
      linhasCSV.push([
        r.id,
        r.empresa,
        r.data.toLocaleDateString('pt-BR'),
        `"${(r.descricao_original || '').replace(/"/g, '""')}"`,
        parseFloat(r.valor).toFixed(2),
        r.tipo || '',
        r.cpf_cnpj_origem || '',
        `"${(r.nome_origem || '').replace(/"/g, '""')}"`,
        `"${(r.observacoes || '').replace(/"/g, '""')}"`,
        r.qtd_anexos || 0
      ].join(';'));
    });

    const conteudoCSV = linhasCSV.join('\n');
    const nomeArquivo = `pendentes_classificacao_${new Date().toISOString().split('T')[0]}.csv`;

    fs.writeFileSync(nomeArquivo, conteudoCSV, 'utf8');

    console.log(`✅ Arquivo gerado: ${nomeArquivo}`);
    console.log('');

    // Mostrar resumo
    console.log('📊 RESUMO POR TIPO:');
    const porTipo = {};
    pendentes.forEach(r => {
      const tipo = r.tipo || 'NULL';
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    });

    Object.entries(porTipo).forEach(([tipo, qtd]) => {
      console.log(`   ${tipo}: ${qtd} registros`);
    });
    console.log('');

    // Estatísticas de anexos
    const comAnexo = pendentes.filter(r => r.qtd_anexos > 0).length;
    const semAnexo = pendentes.length - comAnexo;

    console.log('📎 ANEXOS:');
    console.log(`   Com anexos: ${comAnexo}`);
    console.log(`   Sem anexos: ${semAnexo}`);
    console.log('');

    // Listar os registros
    console.log('📝 LISTA COMPLETA:');
    console.log('');

    pendentes.forEach((r, i) => {
      const anexoInfo = r.qtd_anexos > 0 ? `📎 ${r.qtd_anexos} anexo(s)` : '';

      console.log(`${i + 1}. ID: ${r.id} | ${r.empresa} | ${r.data.toLocaleDateString('pt-BR')} ${anexoInfo}`);
      console.log(`   Valor: R$ ${parseFloat(r.valor).toFixed(2)} | Tipo: ${r.tipo || 'NULL'}`);
      console.log(`   Descrição: ${r.descricao_original.substring(0, 100)}`);

      if (r.nome_origem) {
        console.log(`   De/Para: ${r.nome_origem}`);
      }

      console.log('');
    });

    console.log('═══════════════════════════════════════════════════');
    console.log(`📄 Arquivo CSV gerado: ${nomeArquivo}`);
    console.log('   Abra no Excel para classificar manualmente');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    await pool.end();

  } catch (err) {
    console.error('❌ Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

gerarListaPendentes();

// ============================================================
// FIM
// ============================================================
