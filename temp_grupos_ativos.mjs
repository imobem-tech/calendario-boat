// ============================================================
// Script: Listar grupos ATIVOS para comunicado WhatsApp
// V.2606060110
// ============================================================
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require"
});

async function listarGruposAtivos() {
  try {
    console.log('🔍 BUSCANDO GRUPOS ATIVOS...\n');

    // Query complexa para pegar grupos ativos com próxima cobrança
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
          ) as descricao_cobranca
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
        descricao_cobranca
      FROM proxima_cobranca
      WHERE cod_autorizado IS NOT NULL
        AND nome_autorizado IS NOT NULL
      ORDER BY numero_cota, nome_autorizado
    `);

    console.log(`📊 GRUPOS ATIVOS ENCONTRADOS: ${result.rowCount}\n`);
    console.log('═'.repeat(120));
    console.log('');

    let totalComCobranca = 0;
    let totalSemCobranca = 0;

    result.rows.forEach((row, i) => {
      const num = String(i + 1).padStart(3, ' ');
      const cota = row.numero_cota || 'N/A';
      const nome = (row.nome_autorizado || 'SEM NOME').substring(0, 35).padEnd(35);
      const cobranca = row.proxima_cobranca || '   -/-/-   ';
      const grupo = (row.nomegrupowpp || 'Sem nome').substring(0, 40);

      if (row.proxima_cobranca) {
        totalComCobranca++;
        console.log(`${num}. ${cota.padEnd(10)} | ${nome} | 📅 ${cobranca} | ${grupo}`);
      } else {
        totalSemCobranca++;
        console.log(`${num}. ${cota.padEnd(10)} | ${nome} | ⚪ SEM COBR   | ${grupo}`);
      }
    });

    console.log('');
    console.log('═'.repeat(120));
    console.log('');
    console.log(`📊 RESUMO:`);
    console.log(`   Total de grupos: ${result.rowCount}`);
    console.log(`   Com próxima cobrança: ${totalComCobranca}`);
    console.log(`   Sem cobrança futura: ${totalSemCobranca}`);
    console.log('');

    // Exportar CSV para usar no envio
    console.log('📄 GERANDO CSV...\n');

    const csv = [
      'grupowppid;numero_cota;nome_autorizado;telefone;proxima_cobranca;descricao_cobranca'
    ];

    result.rows.forEach(row => {
      csv.push([
        row.grupowppid || '',
        row.numero_cota || '',
        row.nome_autorizado || '',
        row.telefone || '',
        row.proxima_cobranca || '',
        row.descricao_cobranca || ''
      ].join(';'));
    });

    const fs = await import('fs');
    const timestamp = new Date().toISOString().slice(0,19).replace(/[:.]/g, '-');
    const csvFile = `grupos_ativos_${timestamp}.csv`;

    fs.writeFileSync(csvFile, csv.join('\n'), 'utf-8');

    console.log(`✅ Arquivo CSV gerado: ${csvFile}`);
    console.log('');

    return result.rows;

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

listarGruposAtivos();
