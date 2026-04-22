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

    // ✅ QUERY CORRIGIDA (AGORA TRAZ LETRA + NÚMERO)
    const result = await pool.query(
      `
      SELECT
        "Dt_Saída",
        "Grupo_Comp_letra",
        "Código"
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = $1
        AND "Dt_Saída" BETWEEN $2 AND $3
        AND "Dt_Cancela_saida" IS NULL
        AND "Dt_Desistencia" IS NULL
      `,
      [pb, startDate, endDate]
    );

    const agendamentos = {};

    result.rows.forEach(r => {
      const data = new Date(r["Dt_Saída"]);
      const d = formatDateLocal(data);

      const letra = (r["Grupo_Comp_letra"] || "").toUpperCase();

      // ⚠️ AJUSTE AQUI SE EXISTIR CAMPO DE NÚMERO DO GRUPO
      // Se não existir, usamos fallback "1"
      const numero = "1";

      const grupo = letra ? `${letra}${numero}` : "AG";

      agendamentos[d] = grupo;
    });

    const resp = [];
    let cur = new Date(startDate);

    while (cur <= endDate) {
      const d = formatDateLocal(cur);

      let status = "free";
      let label = null;

      const dow = cur.getDay();

      // 🟡 folga = segunda
      if (dow === 1) {
        status = "folga";
      }

      // 🔴 ocupado (PRIORIDADE MÁXIMA)
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

    res.status(200).json(resp);

  } catch (err) {
    console.error("ERRO availability:", err);
    res.status(500).json({ error: err.message });
  }
}
