import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

console.log('\n📋 Buscando grupos administrativos...\n');

const res = await pool.query(`
  SELECT grupo_id, nome_grupo, pb, cota, criado_em
  FROM public.wpp_grupos_agenda  
  WHERE nome_grupo ILIKE '%adm%'
  ORDER BY criado_em DESC
  LIMIT 5
`);

if (res.rows.length > 0) {
  console.log(`✅ Encontrados ${res.rows.length} grupos:\n`);
  res.rows.forEach((g, i) => {
    console.log(`[${i+1}] ${g.nome_grupo}`);
    console.log(`    JID: ${g.grupo_id}`);
    console.log(`    PB: ${g.pb || 'Geral'} | Cota: ${g.cota || 'Todas'}\n`);
  });
} else {
  console.log('⚠️ Nenhum grupo administrativo encontrado');
}

await pool.end();
