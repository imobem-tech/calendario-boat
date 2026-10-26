// ============================================================
// listar_embarcacoes_cotistas.js — V.2610241620
// Lista quais embarcações têm cotistas ativos
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function listar() {
  try {
    console.log('🔍 EMBARCAÇÕES x COTISTAS ATIVOS\n');

    const result = await pool.query(`
      SELECT
        e."Código" as id_embarcacao,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao,
        COUNT(a."Código") as qtd_cotistas
      FROM "P_BOAT_1_Embarcacao" e
      LEFT JOIN "P_BOAT_4_Autorizados" a
        ON a."Cod_Embarcacao" = e."Código"
        AND a."Dt_Desautorizacao" IS NULL
      WHERE e."Num_PB" IS NOT NULL
      GROUP BY e."Código", e."Num_PB", e."Nome_Embar"
      ORDER BY e."Num_PB"
    `);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PB      | Nome Embarcação         | Cotistas');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let comCotistas = 0;
    let semCotistas = 0;

    result.rows.forEach(row => {
      const pb = row.numero_pb.padEnd(8);
      const nome = row.nome_embarcacao.padEnd(25).substring(0, 25);
      const qtd = row.qtd_cotistas.toString().padStart(8);

      if (row.qtd_cotistas > 0) {
        console.log(`${pb}| ${nome}| ✅ ${qtd}`);
        comCotistas++;
      } else {
        console.log(`${pb}| ${nome}| ❌      0`);
        semCotistas++;
      }
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 Resumo:`);
    console.log(`   ✅ Com cotistas ativos: ${comCotistas}`);
    console.log(`   ❌ Sem cotistas ativos: ${semCotistas}`);
    console.log(`   📈 Total: ${result.rows.length}\n`);

    process.exit(0);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

listar();

// ============================================================
// FIM — V.2610241620
// ============================================================
