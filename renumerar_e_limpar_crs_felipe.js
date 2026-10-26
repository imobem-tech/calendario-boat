// ============================================================
// renumerar_e_limpar_crs_felipe.js — V.2610261055
// Renumera 4 CRs do Felipe e limpa dados de pagamento
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import XLSX from 'xlsx';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const IDS_FELIPE = [50287, 50288, 50289, 50290];
const EMPRESA = 8;

async function buscarProximoCodigo() {
  const { rows } = await pool.query(`
    SELECT COALESCE(MAX("Codigo"), 0) + 1 as proximo_codigo
    FROM "Contas_Receber"
    WHERE "Empresa" = $1
  `, [EMPRESA]);

  return rows[0]?.proximo_codigo || null;
}

(async () => {
  try {
    console.log('\n🔧 RENUMERAÇÃO E LIMPEZA - CRs DO FELIPE\n');
    console.log('═'.repeat(100));

    // 1. Buscar dados atuais
    console.log('\n📋 DADOS ATUAIS:\n');
    const dadosAtuais = [];

    for (const id of IDS_FELIPE) {
      const { rows } = await pool.query(`
        SELECT
          "ID", "Codigo", "Descrição", "Valor", "Data_Vencimento",
          "Portador", "agendamento_obs"
        FROM "Contas_Receber"
        WHERE "ID" = $1
      `, [id]);

      if (rows[0]) {
        dadosAtuais.push(rows[0]);
        const cr = rows[0];
        console.log(`ID ${cr.ID} | Código ${cr.Codigo} | R$ ${parseFloat(cr.Valor).toFixed(2)}`);
        console.log(`   Portador: ${cr.Portador || 'vazio'}`);
        console.log(`   Link: ${cr.agendamento_obs || 'vazio'}`);
      }
    }

    // 2. Buscar próximos códigos disponíveis
    console.log('\n\n🔢 BUSCANDO PRÓXIMOS CÓDIGOS DISPONÍVEIS...\n');

    const codigoBase = await buscarProximoCodigo();
    if (!codigoBase) {
      throw new Error('Não foi possível obter próximo código');
    }

    const novosCodigos = [];
    for (let i = 0; i < IDS_FELIPE.length; i++) {
      const codigo = codigoBase + i;
      novosCodigos.push(codigo);
      console.log(`   ${i + 1}. Próximo código: ${codigo}`);
    }

    // 3. Mostrar plano de renumeração
    console.log('\n\n📊 PLANO DE RENUMERAÇÃO:\n');
    console.log('─'.repeat(100));

    const relatorio = [];
    dadosAtuais.forEach((cr, idx) => {
      const codigoNovo = novosCodigos[idx];
      console.log(`ID ${cr.ID}:`);
      console.log(`   Código ANTIGO: ${cr.Codigo}`);
      console.log(`   Código NOVO: ${codigoNovo}`);
      console.log(`   Ações:`);
      console.log(`     • Atualizar Codigo: ${cr.Codigo} → ${codigoNovo}`);
      console.log(`     • Limpar Portador: "${cr.Portador || 'vazio'}" → NULL`);
      console.log(`     • Limpar agendamento_obs: "${cr.agendamento_obs || 'vazio'}" → NULL`);
      console.log('');

      relatorio.push({
        'ID': cr.ID,
        'Código ANTIGO': cr.Codigo,
        'Código NOVO': codigoNovo,
        'Descrição': cr.Descrição,
        'Valor': parseFloat(cr.Valor),
        'Vencimento': cr.Data_Vencimento?.toISOString().split('T')[0],
        'Portador ANTES': cr.Portador || 'vazio',
        'Link ANTES': cr.agendamento_obs || 'vazio',
        'Status': 'Aguardando execução'
      });
    });

    // 4. Executar renumeração e limpeza
    console.log('\n' + '═'.repeat(100));
    console.log('\n🚀 EXECUTANDO RENUMERAÇÃO E LIMPEZA...\n');

    for (let i = 0; i < dadosAtuais.length; i++) {
      const cr = dadosAtuais[i];
      const codigoNovo = String(novosCodigos[i]); // Converter para string

      console.log(`ID ${cr.ID}: Atualizando...`);

      await pool.query(`
        UPDATE "Contas_Receber"
        SET
          "Codigo" = $1::integer,
          "Documento" = $1,
          "Portador" = NULL,
          "agendamento_obs" = NULL,
          "Boleto_Linha_Digitável" = NULL
        WHERE "ID" = $2
      `, [codigoNovo, cr.ID]);

      console.log(`   ✅ Código atualizado: ${cr.Codigo} → ${codigoNovo}`);
      console.log(`   ✅ Portador limpo`);
      console.log(`   ✅ agendamento_obs limpo`);
      console.log(`   ✅ Boleto_Linha_Digitável limpo`);

      relatorio[i]['Status'] = '✅ CONCLUÍDO';
    }

    // 5. Verificar resultado
    console.log('\n\n' + '═'.repeat(100));
    console.log('\n✅ VERIFICAÇÃO FINAL:\n');

    for (const id of IDS_FELIPE) {
      const { rows } = await pool.query(`
        SELECT "ID", "Codigo", "Portador", "agendamento_obs"
        FROM "Contas_Receber"
        WHERE "ID" = $1
      `, [id]);

      if (rows[0]) {
        const cr = rows[0];
        console.log(`ID ${cr.ID}:`);
        console.log(`   Código: ${cr.Codigo}`);
        console.log(`   Portador: ${cr.Portador || 'NULL ✅'}`);
        console.log(`   Link: ${cr.agendamento_obs || 'NULL ✅'}`);
        console.log('');
      }
    }

    // 6. Gerar Excel com relatório
    console.log('═'.repeat(100));
    console.log('\n📊 Gerando relatório Excel...\n');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(relatorio);

    const wscols = [
      { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 45 }, { wch: 12 },
      { wch: 12 }, { wch: 30 }, { wch: 60 }, { wch: 15 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Renumeração Felipe');

    const nomeArquivo = 'Relatorio_Renumeracao_Felipe.xlsx';
    XLSX.writeFile(wb, nomeArquivo);

    console.log(`✅ Relatório gerado: ${nomeArquivo}`);
    console.log(`📍 Localização: C:\\Users\\NOTEBOOK\\projetos\\calendario_allmax\\${nomeArquivo}\n`);

    console.log('═'.repeat(100));
    console.log('\n✅ RENUMERAÇÃO E LIMPEZA CONCLUÍDAS COM SUCESSO!\n');
    console.log('📋 RESUMO:');
    console.log(`   • ${IDS_FELIPE.length} registros renumerados`);
    console.log(`   • Códigos duplicados eliminados`);
    console.log(`   • Dados de pagamento limpos`);
    console.log(`   • Prontos para emissão futura no Asaas\n`);

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
