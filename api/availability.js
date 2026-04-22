import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDbDateAsLocal(value) {
  if (!value) return null;

  const dt = new Date(value);

  return new Date(
    dt.getFullYear(),
    dt.getMonth(),
    dt.getDate()
  );
}

export default async function handler(req, res) {
  try {
    const pb = parseInt(req.query.pb, 10);
    const start = req.query.start || formatDateLocal(new Date());
    const months = parseInt(req.query.months || "1", 10);

    if (!pb || pb <= 0) {
      return res.status(400).json({ error: "pb inválido" });
    }

    const startDate = new Date(start + "T00:00:00");
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);
    endDate.setDate(endDate.getDate() - 1);

    const result = await pool.query(
      `
      SELECT
        "Dt_Saída",
        "Grupo_Comp_letra",
        "Código"
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = $1
        AND "Dt_Saída" >= $2
        AND "Dt_Saída" < ($3::date + interval '1 day')
        AND "Dt_Cancela_saida" IS NULL
        AND "Dt_Desistencia" IS NULL
      ORDER BY "Dt_Saída"
      `,
      [pb, formatDateLocal(startDate), formatDateLocal(endDate)]
    );

    const agendamentos = {};

    result.rows.forEach((r) => {
      const dataLocal = parseDbDateAsLocal(r["Dt_Saída"]);
      if (!dataLocal) return;

      const d = formatDateLocal(dataLocal);
      const grupo = String(r["Grupo_Comp_letra"] || "").trim().toUpperCase();

      agendamentos[d] = grupo || "AG";
    });

    const resp = [];
    let cur = new Date(startDate);

    while (cur <= endDate) {
      const d = formatDateLocal(cur);

      let status = "free";
      let label = null;

      const dow = cur.getDay(); // 0=dom, 1=seg

      // folga de segunda
      if (dow === 1) {
        status = "folga";
      }

      // ocupado tem prioridade
      if (agendamentos[d]) {
        status = "busy";
        label = agendamentos[d];
      }

      resp.push({
        date: d,
        status,
        label
      });

      cur.setDate(cur.getDate() + 1);
    }

    return res.status(200).json(resp);

  } catch (err) {
    console.error("ERRO availability:", err);
    return res.status(500).json({ error: err.message });
  }
}
