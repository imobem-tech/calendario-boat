// ============================================================
// Comparar lista de grupos ativos vs PB_embarcações.xlsx
// V.2606061335
// ============================================================
import pkg from 'pg';
const { Pool } = pkg;
import ExcelJS from 'exceljs';

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require"
});

async function compararListas() {
  try {
    console.log('🔍 LENDO PLANILHA PB_embarcações.xlsx...\n');

    // Ler planilha Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('PB_embarcações.xlsx');
    const worksheet = workbook.worksheets[0];

    const embarcacoesExcel = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Pular cabeçalho

      const pb = row.getCell(1).value;
      const cota = row.getCell(2).value;
      const nome = row.getCell(3).value;

      if (pb && cota) {
        embarcacoesExcel.push({
          pb: String(pb).trim(),
          cota: String(cota).trim().toUpperCase(),
          numero_cota: `${pb}-${String(cota).trim().toUpperCase()}`,
          nome: nome ? String(nome).trim() : '',
          fonte: 'EXCEL'
        });
      }
    });

    console.log(`📊 PLANILHA EXCEL: ${embarcacoesExcel.length} registros\n`);

    // Buscar grupos ativos do banco
    console.log('🔍 BUSCANDO GRUPOS ATIVOS DO BANCO...\n');

    const result = await pool.query(`
      WITH grupos_com_dados AS (
        SELECT
          g.grupowppid,
          g.nomegrupowpp,
          g.pb,
          g.cota,
          CONCAT(g.pb, '-', UPPER(g.cota)) as numero_cota,

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
          c."Cliente_Nome" as nome_autorizado
        FROM grupos_com_dados gd
        LEFT JOIN public."Cliente" c ON c."Codigo" = gd.cod_autorizado
      )
      SELECT
        pb,
        cota,
        numero_cota,
        cod_autorizado,
        nome_autorizado,
        nomegrupowpp
      FROM grupos_com_cliente
      WHERE cod_autorizado IS NOT NULL
        AND nome_autorizado IS NOT NULL
      ORDER BY numero_cota
    `);

    const gruposAtivos = result.rows.map(r => ({
      pb: String(r.pb),
      cota: String(r.cota).toUpperCase(),
      numero_cota: r.numero_cota,
      nome: r.nome_autorizado || '',
      cod_autorizado: r.cod_autorizado,
      grupo: r.nomegrupowpp,
      fonte: 'BANCO'
    }));

    console.log(`📊 GRUPOS ATIVOS BANCO: ${gruposAtivos.length} registros\n`);

    // Criar Sets para comparação
    const cotasExcel = new Set(embarcacoesExcel.map(e => e.numero_cota));
    const cotasBanco = new Set(gruposAtivos.map(g => g.numero_cota));

    // Encontrar diferenças
    const apenasExcel = embarcacoesExcel.filter(e => !cotasBanco.has(e.numero_cota));
    const apenasBanco = gruposAtivos.filter(g => !cotasExcel.has(g.numero_cota));
    const emAmbos = gruposAtivos.filter(g => cotasExcel.has(g.numero_cota));

    console.log('═'.repeat(100));
    console.log('📊 RESUMO DA COMPARAÇÃO');
    console.log('═'.repeat(100));
    console.log('');
    console.log(`📄 Total na PLANILHA EXCEL:     ${embarcacoesExcel.length}`);
    console.log(`💾 Total no BANCO (Ativos):     ${gruposAtivos.length}`);
    console.log(`✅ EM AMBAS as listas:          ${emAmbos.length}`);
    console.log(`📄 APENAS na PLANILHA:          ${apenasExcel.length}`);
    console.log(`💾 APENAS no BANCO:             ${apenasBanco.length}`);
    console.log('');

    if (apenasExcel.length > 0) {
      console.log('═'.repeat(100));
      console.log(`📄 COTAS QUE ESTÃO NA PLANILHA MAS NÃO NO BANCO (${apenasExcel.length}):`);
      console.log('═'.repeat(100));
      console.log('');
      console.log('POSSÍVEIS MOTIVOS:');
      console.log('  - Grupo não cadastrado em wpp_grupos_agenda');
      console.log('  - Nunca fez agendamento (sem Cod_Autorizado)');
      console.log('  - Cliente sem nome cadastrado');
      console.log('');

      apenasExcel.forEach((item, i) => {
        console.log(`${String(i+1).padStart(3)}. ${item.numero_cota.padEnd(12)} | ${item.nome.substring(0, 40)}`);
      });
      console.log('');
    }

    if (apenasBanco.length > 0) {
      console.log('═'.repeat(100));
      console.log(`💾 COTAS QUE ESTÃO NO BANCO MAS NÃO NA PLANILHA (${apenasBanco.length}):`);
      console.log('═'.repeat(100));
      console.log('');
      console.log('POSSÍVEIS MOTIVOS:');
      console.log('  - Cota nova criada recentemente');
      console.log('  - Planilha desatualizada');
      console.log('  - Erro na exportação da planilha');
      console.log('');

      apenasBanco.forEach((item, i) => {
        console.log(`${String(i+1).padStart(3)}. ${item.numero_cota.padEnd(12)} | ${item.nome.substring(0, 40)}`);
      });
      console.log('');
    }

    // Gerar relatório em Excel
    console.log('📄 GERANDO RELATÓRIO COMPARATIVO EM EXCEL...\n');

    const relatorio = new ExcelJS.Workbook();

    // Aba 1: Resumo
    const wsResumo = relatorio.addWorksheet('Resumo');
    wsResumo.columns = [
      { header: 'Métrica', key: 'metrica', width: 40 },
      { header: 'Quantidade', key: 'quantidade', width: 15 }
    ];

    wsResumo.addRow({ metrica: 'Total na PLANILHA EXCEL', quantidade: embarcacoesExcel.length });
    wsResumo.addRow({ metrica: 'Total no BANCO (Ativos)', quantidade: gruposAtivos.length });
    wsResumo.addRow({ metrica: 'EM AMBAS as listas', quantidade: emAmbos.length });
    wsResumo.addRow({ metrica: 'APENAS na PLANILHA', quantidade: apenasExcel.length });
    wsResumo.addRow({ metrica: 'APENAS no BANCO', quantidade: apenasBanco.length });

    wsResumo.getRow(1).font = { bold: true };
    wsResumo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };

    // Aba 2: Apenas Excel
    const wsExcel = relatorio.addWorksheet('Apenas Planilha');
    wsExcel.columns = [
      { header: 'Cota', key: 'numero_cota', width: 12 },
      { header: 'PB', key: 'pb', width: 8 },
      { header: 'Cota', key: 'cota', width: 8 },
      { header: 'Nome', key: 'nome', width: 40 }
    ];
    wsExcel.getRow(1).font = { bold: true };
    wsExcel.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
    apenasExcel.forEach(item => wsExcel.addRow(item));

    // Aba 3: Apenas Banco
    const wsBanco = relatorio.addWorksheet('Apenas Banco');
    wsBanco.columns = [
      { header: 'Cota', key: 'numero_cota', width: 12 },
      { header: 'PB', key: 'pb', width: 8 },
      { header: 'Cota', key: 'cota', width: 8 },
      { header: 'Nome', key: 'nome', width: 40 },
      { header: 'Cód. Cliente', key: 'cod_autorizado', width: 12 },
      { header: 'Grupo WPP', key: 'grupo', width: 40 }
    ];
    wsBanco.getRow(1).font = { bold: true };
    wsBanco.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4ECDC4' } };
    apenasBanco.forEach(item => wsBanco.addRow(item));

    // Aba 4: Em Ambas
    const wsAmbas = relatorio.addWorksheet('Em Ambas');
    wsAmbas.columns = [
      { header: 'Cota', key: 'numero_cota', width: 12 },
      { header: 'Nome', key: 'nome', width: 40 },
      { header: 'Cód. Cliente', key: 'cod_autorizado', width: 12 }
    ];
    wsAmbas.getRow(1).font = { bold: true };
    wsAmbas.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF95E1D3' } };
    emAmbos.forEach(item => wsAmbas.addRow(item));

    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
    const filename = `comparacao_listas_${timestamp}.xlsx`;
    await relatorio.xlsx.writeFile(filename);

    console.log(`✅ Relatório gerado: ${filename}`);
    console.log('');

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

compararListas();
