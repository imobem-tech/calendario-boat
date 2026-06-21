import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require"
});

async function investigar() {
  try {
    // Mesma query que o código usa
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = 151
        AND "Cod_Autorizado" = 3327
        AND "Grupo_Comp_letra" = '11'
        AND "Dt_Agendamento"::date >= CURRENT_DATE
        AND "Dt_Desistencia" IS NULL
        AND "Dt_Cancela_saida" IS NULL
    `);

    console.log('AGENDAMENTOS EM ABERTO (PB 151, Autorizado 3327, Grupo 11):');
    console.log('Total:', result.rows[0].total);
    console.log('');
    console.log('Limite esperado: 1');
    console.log('Deveria bloquear?', result.rows[0].total >= 1 ? 'SIM' : 'NÃO');

    // Listar os agendamentos
    const lista = await pool.query(`
      SELECT "Código",
             TO_CHAR("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as dt
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = 151
        AND "Cod_Autorizado" = 3327
        AND "Grupo_Comp_letra" = '11'
        AND "Dt_Agendamento"::date >= CURRENT_DATE
        AND "Dt_Desistencia" IS NULL
        AND "Dt_Cancela_saida" IS NULL
      ORDER BY "Dt_Agendamento"
    `);

    console.log('');
    console.log('DETALHES:');
    lista.rows.forEach(r => {
      console.log(`  - Código ${r.Código}: ${r.dt}`);
    });

  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await pool.end();
  }
}

investigar();

// Ver EXATAMENTE o que está gravado
async function verTodosGrupos() {
  try {
    const pool2 = new Pool({
      connectionString: "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require"
    });

    console.log('\n========================================');
    console.log('TODOS OS REGISTROS PB 151 (FUTUROS):');
    console.log('========================================\n');

    const todos = await pool2.query(`
      SELECT "Código", "Cod_Autorizado", "Grupo_Comp_letra",
             TO_CHAR("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as dt
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = 151
        AND "Dt_Agendamento"::date >= CURRENT_DATE
        AND "Dt_Desistencia" IS NULL
        AND "Dt_Cancela_saida" IS NULL
      ORDER BY "Dt_Agendamento"
    `);

    todos.rows.forEach(r => {
      console.log(`Código ${r.Código}: Grupo [${r.Grupo_Comp_letra}] | Autor. ${r.Cod_Autorizado} | ${r.dt}`);
    });

    await pool2.end();
  } catch (err) {
    console.error('ERRO:', err.message);
  }
}

setTimeout(() => verTodosGrupos(), 1000);
