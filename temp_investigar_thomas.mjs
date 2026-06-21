// Investigar por que bot enviou contas para Thomas (4234)
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require"
});

async function investigar() {
  try {
    console.log('🔍 INVESTIGANDO CLIENTE 4234 (THOMAS THIAGO CALIL)\n');

    // Verificar dados do cliente
    const cliente = await pool.query(`
      SELECT "Codigo", "Cliente_Nome", "Cliente_Telefone_Celular"
      FROM public."Cliente"
      WHERE "Codigo" = 4234
    `);

    console.log('📋 DADOS DO CLIENTE:');
    console.log(cliente.rows[0]);
    console.log('');

    // Verificar agendamentos recentes (últimas 48h)
    const agendamentos = await pool.query(`
      SELECT "Código",
             "Cod_Autorizado",
             "Cod_Emb_PB",
             "Grupo_Comp_letra",
             TO_CHAR("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as dt_agendamento
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Autorizado" = 4234
        AND "Dt_Agendamento" >= NOW() - INTERVAL '48 hours'
      ORDER BY "Dt_Agendamento" DESC
      LIMIT 10
    `);

    console.log('📅 AGENDAMENTOS NAS ÚLTIMAS 48H:');
    if (agendamentos.rowCount === 0) {
      console.log('   ❌ NENHUM agendamento nas últimas 48h');
    } else {
      agendamentos.rows.forEach(r => {
        console.log(`   - Código ${r.Código}: ${r.Cod_Emb_PB}-${r.Grupo_Comp_letra} | Agendado para ${r.dt_agendamento}`);
      });
    }
    console.log('');

    // Verificar contas em aberto
    const contas = await pool.query(`
      SELECT "Codigo", "Descrição", "Valor",
             TO_CHAR("Data_Vencimento", 'DD/MM/YYYY') as vencimento
      FROM public."Contas_Receber"
      WHERE "Código_Cliente" = 4234
        AND "Data_Pagamento" IS NULL
      ORDER BY "Data_Vencimento"
    `);

    console.log('💰 CONTAS EM ABERTO:');
    contas.rows.forEach(r => {
      console.log(`   - ${r.Descrição}: R$ ${r.Valor} (Venc: ${r.vencimento})`);
    });
    console.log('');

    // Verificar se há registro na fila WPP
    const fila = await pool.query(`
      SELECT mensagem, status,
             TO_CHAR(criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as criado
      FROM public.wpp_fila_agenda
      WHERE mensagem LIKE '%4234%' OR mensagem LIKE '%THOMAS%'
      ORDER BY criado_em DESC
      LIMIT 5
    `);

    console.log('📨 FILA WPP (mensagens relacionadas):');
    if (fila.rowCount === 0) {
      console.log('   ❌ Nenhuma mensagem na fila');
    } else {
      fila.rows.forEach((r, i) => {
        console.log(`   ${i+1}. ${r.criado} - Status: ${r.status}`);
        console.log(`      ${r.mensagem.substring(0, 100)}...`);
      });
    }

  } catch (err) {
    console.error('❌ ERRO:', err.message);
  } finally {
    await pool.end();
  }
}

investigar();
