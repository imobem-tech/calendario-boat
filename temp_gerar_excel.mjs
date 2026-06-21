// ============================================================
// Gerar planilha Excel com grupos ativos
// V.2606061330
// ============================================================
import pkg from 'pg';
const { Pool } = pkg;
import ExcelJS from 'exceljs';

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require"
});

async function gerarExcel() {
  try {
    console.log('🔍 BUSCANDO GRUPOS ATIVOS...\n');

    const result = await pool.query(`
      WITH grupos_com_dados AS (
        SELECT
          g.grupowppid,
          g.nomegrupowpp,
          g.pb,
          g.cota,
          CONCAT(g.pb, '-', UPPER(g.cota)) as numero_cota,

          -- Buscar código do autorizado da última saída
          (
            SELECT "Cod_Autorizado"
            FROM public."P_BOAT_z_10_Saida_Emb" s
            WHERE s."Cod_Emb_PB" = g.pb
              AND UPPER(s."Grupo_Comp_letra") = UPPER(g.cota)
            ORDER BY "Dt_Agendamento" DESC
            LIMIT 1
          ) as cod_autorizado

        FROM public.wpp_grupos_agenda g
        WHERE g.pb IS NOT NULL
          AND g.cota IS NOT NULL
      ),
      grupos_com_cliente AS (
        SELECT
          gd.*,
          c."Cliente_Nome" as nome_autorizado,
          c."Cliente_Telefone_Celular" as telefone
        FROM grupos_com_dados gd
        LEFT JOIN public."Cliente" c ON c."Codigo" = gd.cod_autorizado
      ),
      proxima_cobranca AS (
        SELECT
          gc.*,
          (
            SELECT MIN("Data_Vencimento")
            FROM public."Contas_Receber" cr
            WHERE cr."Código_Cliente" = gc.cod_autorizado
              AND cr."Data_Pagamento" IS NULL
              AND cr."Data_Vencimento" >= CURRENT_DATE
          ) as proxima_cobranca_dt,
          (
            SELECT "Descrição"
            FROM public."Contas_Receber" cr
            WHERE cr."Código_Cliente" = gc.cod_autorizado
              AND cr."Data_Pagamento" IS NULL
              AND cr."Data_Vencimento" >= CURRENT_DATE
            ORDER BY "Data_Vencimento"
            LIMIT 1
          ) as descricao_cobranca,
          (
            SELECT "Valor"
            FROM public."Contas_Receber" cr
            WHERE cr."Código_Cliente" = gc.cod_autorizado
              AND cr."Data_Pagamento" IS NULL
              AND cr."Data_Vencimento" >= CURRENT_DATE
            ORDER BY "Data_Vencimento"
            LIMIT 1
          ) as valor_cobranca
        FROM grupos_com_cliente gc
      )
      SELECT
        grupowppid,
        nomegrupowpp,
        numero_cota,
        cod_autorizado,
        nome_autorizado,
        telefone,
        TO_CHAR(proxima_cobranca_dt, 'DD/MM/YYYY') as proxima_cobranca,
        descricao_cobranca,
        valor_cobranca
      FROM proxima_cobranca
      WHERE cod_autorizado IS NOT NULL
        AND nome_autorizado IS NOT NULL
      ORDER BY numero_cota, nome_autorizado
    `);

    console.log(`📊 GRUPOS ENCONTRADOS: ${result.rowCount}\n`);

    // Criar workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Grupos Ativos');

    // Definir colunas
    worksheet.columns = [
      { header: 'ID Grupo WPP', key: 'grupowppid', width: 25 },
      { header: 'Nome do Grupo', key: 'nomegrupowpp', width: 40 },
      { header: 'Cota (PB-X)', key: 'numero_cota', width: 12 },
      { header: 'Cód. Cliente', key: 'cod_autorizado', width: 12 },
      { header: 'Nome Autorizado', key: 'nome_autorizado', width: 40 },
      { header: 'Telefone', key: 'telefone', width: 18 },
      { header: 'Próx. Cobrança', key: 'proxima_cobranca', width: 15 },
      { header: 'Descrição', key: 'descricao_cobranca', width: 35 },
      { header: 'Valor', key: 'valor_cobranca', width: 12 }
    ];

    // Estilizar cabeçalho
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0070C0' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Adicionar dados
    result.rows.forEach((row, index) => {
      const excelRow = worksheet.addRow({
        grupowppid: row.grupowppid || '',
        nomegrupowpp: row.nomegrupowpp || '',
        numero_cota: row.numero_cota || '',
        cod_autorizado: row.cod_autorizado || '',
        nome_autorizado: row.nome_autorizado || '',
        telefone: row.telefone || '',
        proxima_cobranca: row.proxima_cobranca || '',
        descricao_cobranca: row.descricao_cobranca || '',
        valor_cobranca: row.valor_cobranca || ''
      });

      // Alternar cores das linhas
      if (index % 2 === 0) {
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' }
        };
      }

      // Destacar linhas COM cobrança
      if (row.proxima_cobranca) {
        excelRow.getCell('proxima_cobranca').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' }
        };
        excelRow.getCell('proxima_cobranca').font = { bold: true };
      }
    });

    // Adicionar filtros
    worksheet.autoFilter = {
      from: 'A1',
      to: 'I1'
    };

    // Congelar primeira linha
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];

    // Salvar arquivo
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
    const filename = `grupos_ativos_${timestamp}.xlsx`;

    await workbook.xlsx.writeFile(filename);

    console.log(`✅ Planilha Excel gerada: ${filename}`);
    console.log('');
    console.log('📊 RESUMO:');
    console.log(`   Total de grupos: ${result.rowCount}`);
    console.log(`   Com cobrança: ${result.rows.filter(r => r.proxima_cobranca).length}`);
    console.log(`   Sem cobrança: ${result.rows.filter(r => !r.proxima_cobranca).length}`);
    console.log('');

    return filename;

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

gerarExcel();
