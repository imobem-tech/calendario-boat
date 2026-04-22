import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ===== DECODER =====
const MAP = { a:"1", b:"2", c:"3", d:"4", e:"5", f:"6", g:"7", h:"8", i:"9", j:"0" };

function decode(token) {
  const t = String(token || "").trim().toLowerCase();
  const m = t.match(/^([a-j]+)([a-z])([a-j])$/);
  if (!m) return null;

  const pb = m[1].split("").map(x => MAP[x]).join("");
  const grupo = m[2].toUpperCase() + MAP[m[3]];

  return { pb, grupo };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método não permitido" });
    }

    const { token, data, hora } = req.body || {};

    const acesso = decode(token);
    if (!acesso) {
      return res.status(400).json({ error: "token inválido" });
    }

    if (!data || !hora) {
      return res.status(400).json({ error: "data/hora inválidas" });
    }

    const pb = Number(acesso.pb);
    const grupo = acesso.grupo;
    const dtAgendamento = `${data} ${hora}:00`;

    // ===== 1. BLOQUEIO DA EMBARCAÇÃO (POR DIA, INDEPENDENTE DO HORÁRIO)
    const existe = await pool.query(`
      SELECT 1
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = $1
        AND DATE("Dt_Agendamento") = $2::date
        AND "Dt_Cancela_saida" IS NULL
        AND "Dt_Desistencia" IS NULL
      LIMIT 1
    `, [pb, data]);

    if (existe.rows.length) {
      return res.status(400).json({
        error: "data não está mais disponível"
      });
    }

    // ===== 2. CAPACIDADE DO GRUPO
    const capacidade = parseInt(grupo.slice(-1), 10);

    const aberto = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM public."P_BOAT_z_10_Saida_Emb"
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
    `, [grupo]);

    const usados = aberto.rows[0]?.total || 0;

    // ===== 3. CONTINGÊNCIA
    const agora = new Date();
    const hojeLocal = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const hojeStr = `${hojeLocal.getFullYear()}-${String(hojeLocal.getMonth() + 1).padStart(2, "0")}-${String(hojeLocal.getDate()).padStart(2, "0")}`;
    const diaSemana = hojeLocal.getDay(); // 0=dom ... 6=sab
    const mesmaData = data === hojeStr;
    const contingencia = (diaSemana >= 2 && diaSemana <= 4 && mesmaData); // ter-qui e mesmo dia

    if (usados >= capacidade && !contingencia) {
      return res.status(400).json({
        error: `disponibilidade ${capacidade} já utilizada(s), na(s) data(s) em aberto`
      });
    }

    // ===== 4. GERA ID E CÓDIGO COM RETRY
    let inserted = false;
    let ultimoErro = null;

    for (let i = 0; i < 8; i++) {
      const seq = await pool.query(`
        SELECT
          COALESCE(MAX("ID"), 0) + 1       AS prox_id,
          COALESCE(MAX("Código"), 0) + 1   AS prox_codigo
        FROM public."P_BOAT_z_10_Saida_Emb"
      `);

      const proxId = Number(seq.rows[0].prox_id);
      const proxCodigo = Number(seq.rows[0].prox_codigo);

      try {
        await pool.query(`
          INSERT INTO public."P_BOAT_z_10_Saida_Emb"
          (
            "ID",
            "Código",
            "Cod_Emb_PB",
            "Cod_Autorizado",
            "Grupo_Comp_letra",
            "Dt_Agendamento",
            "Dt_Solicitacao"
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          proxId,
          proxCodigo,
          pb,
          4255,
          grupo,
          dtAgendamento
        ]);

        inserted = true;
        break;
      } catch (e) {
        ultimoErro = e;
      }
    }

    if (!inserted) {
      throw ultimoErro || new Error("Falha ao gravar agendamento");
    }

    let msg = "agendamento realizado";
    if (contingencia) {
      msg += " (agendamento sob regra de contingência)";
    }

    return res.status(200).json({ msg });

  } catch (err) {
    console.error("ERRO agendar:", err);
    return res.status(500).json({
      error: err.message || "Erro ao gravar agendamento"
    });
  }
}
