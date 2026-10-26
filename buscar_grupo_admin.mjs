// Script rápido para buscar grupo Administrativo Allmax
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function buscar() {
  console.log('\n🔍 Buscando mensagem "." dos últimos 5 minutos...\n');

  // Buscar mensagem "." recente
  const resMensagem = await pool.query(`
    SELECT
        m.id,
        m.mensagem,
        m.criado_em AT TIME ZONE 'America/Sao_Paulo' as data_hora_br,
        m.grupo_id,
        g.nomegrupowpp AS grupo_nome,
        g.grupowppid AS grupo_jid
    FROM wpp_fila_agenda m
    LEFT JOIN wpp_grupos_agenda g ON m.grupo_id::text = g.grupowppid
    WHERE m.criado_em >= NOW() - INTERVAL '15 minutes'
        AND (m.mensagem = '.' OR m.mensagem LIKE '.%')
    ORDER BY m.criado_em DESC
    LIMIT 10
  `);

  if (resMensagem.rows.length > 0) {
    console.log('📬 Mensagens encontradas:');
    resMensagem.rows.forEach(row => {
      console.log(`  - Grupo: ${row.grupo_nome}`);
      console.log(`    JID: ${row.grupo_jid}`);
      console.log(`    Mensagem: "${row.mensagem}"`);
      console.log(`    Hora: ${row.data_hora_br}`);
      console.log('');
    });
  } else {
    console.log('❌ Nenhuma mensagem "." encontrada nos últimos 15 minutos\n');
  }

  console.log('\n---\n');
  console.log('🔍 Buscando grupos com "Admin" ou "Allmax" no nome...\n');

  // Buscar grupos administrativos
  const resGrupos = await pool.query(`
    SELECT
        grupowppid,
        nomegrupowpp,
        pb,
        cota
    FROM wpp_grupos_agenda
    WHERE nomegrupowpp ILIKE '%admin%'
       OR nomegrupowpp ILIKE '%allmax%'
    LIMIT 20
  `);

  if (resGrupos.rows.length > 0) {
    console.log(`✅ ${resGrupos.rows.length} grupos encontrados:\n`);
    resGrupos.rows.forEach(grupo => {
      console.log(`📱 ${grupo.nomegrupowpp}`);
      console.log(`   JID: ${grupo.grupowppid}`);
      console.log(`   PB: ${grupo.pb || 'N/A'} | Cota: ${grupo.cota || 'N/A'}`);
      console.log('');
    });
  } else {
    console.log('❌ Nenhum grupo com "Admin" ou "Allmax" encontrado\n');
  }

  await pool.end();
}

buscar().catch(console.error);
