import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ===== DECODER =====
const MAP = { a:"1",b:"2",c:"3",d:"4",e:"5",f:"6",g:"7",h:"8",i:"9",j:"0" };

function decode(token){
  const m = token.match(/^([a-j]+)([a-z])([a-j])$/);
  if(!m) return null;

  const pb = m[1].split("").map(x=>MAP[x]).join("");
  const grupo = m[2].toUpperCase() + MAP[m[3]];

  return { pb, grupo };
}

// ===== HANDLER =====
export default async function handler(req,res){

try{

  const { token, data, hora } = req.body;

  const acesso = decode(token);
  if(!acesso) return res.status(400).json({ error:"token inválido" });

  const pb = acesso.pb;
  const grupo = acesso.grupo;

  const dtAgendamento = `${data} ${hora}:00`;

  // ===== 1. BLOQUEIO DA EMBARCAÇÃO (POR DIA)
  const existe = await pool.query(`
    SELECT 1 FROM public."P_BOAT_z_10_Saida_Emb"
    WHERE "Cod_Emb_PB" = $1
      AND DATE("Dt_Agendamento") = $2
      AND "Dt_Cancela_saida" IS NULL
      AND "Dt_Desistencia" IS NULL
    LIMIT 1
  `,[pb,data]);

  if(existe.rows.length){
    return res.status(400).json({
      error:"data não está mais disponível"
    });
  }

  // ===== 2. CAPACIDADE DO GRUPO =====
  const capacidade = parseInt(grupo.slice(-1),10);

  const aberto = await pool.query(`
    SELECT COUNT(*) FROM public."P_BOAT_z_10_Saida_Emb"
    WHERE "Grupo_Comp_letra" = $1
      AND "Dt_Cancela_saida" IS NULL
      AND "Dt_Desistencia" IS NULL
      AND (
        DATE("Dt_Agendamento") > CURRENT_DATE
        OR (
          DATE("Dt_Agendamento") = CURRENT_DATE
          AND CURRENT_TIME < TIME '17:00'
        )
      )
  `,[grupo]);

  const usados = parseInt(aberto.rows[0].count,10);

  // ===== CONTINGÊNCIA =====
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 2-4 = ter-qui

  const mesmaData = data === hoje.toISOString().slice(0,10);
  const contingencia = (diaSemana>=2 && diaSemana<=4 && mesmaData);

  if(usados >= capacidade && !contingencia){
    return res.status(400).json({
      error:`capacidade esgotada (${usados}/${capacidade})`
    });
  }

  // ===== 3. GERAR CÓDIGO =====
  let codigo;

  for(let i=0;i<5;i++){

    const r = await pool.query(`
      SELECT COALESCE(MAX("Código"),0)+1 AS prox
      FROM public."P_BOAT_z_10_Saida_Emb"
    `);

    codigo = r.rows[0].prox;

    try{

      await pool.query(`
        INSERT INTO public."P_BOAT_z_10_Saida_Emb"
        ("Código","Cod_Emb_PB","Grupo_Comp_letra","Dt_Agendamento","Dt_Solicitacao")
        VALUES ($1,$2,$3,$4,NOW())
      `,[codigo,pb,grupo,dtAgendamento]);

      break;

    }catch(e){
      if(i===4) throw e;
    }
  }

  // ===== RESPOSTA =====
  let msg = "agendamento realizado";

  if(contingencia){
    msg += " (regra de contingência)";
  }

  return res.status(200).json({ msg });

}catch(err){
  console.error(err);
  return res.status(500).json({ error: err.message });
}
}
