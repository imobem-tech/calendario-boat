import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ================================
// Helpers
// ================================

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDbDateAsLocal(value) {
  if (!value) return null;

  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);

  if (!y || !m || !d) return null;

  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ================================
// Handler
// ================================

export default async function handler(req, res) {
  try {
    const pb = parseInt(req.query.pb, 10);
    const start = req.query.start || formatDateLocal(new Date());
    const months = parseInt(req.query.months || "1", 10);

    if (!pb || pb <= 0) {
      return res.status(400).json({ error: "pb inválido" });
    }

    if (!months || months <= 0) {
      return res.status(400).json({ error: "months inválido" });
    }

    const startDate = new Date(start + "T00:00:00");
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: "start inválido" });
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);
    endDate.setDate(endDate.getDate() - 1);

    const startStr = formatDateLocal(startDate);
    const endStr = formatDateLocal(endDate);

    // ================================
    // AGENDAMENTOS (CORRIGIDO COM DATE())
    // ================================

    const agResult = await pool.query(
      `
      SELECT
        "ID",
        "Código",
        "Dt_Agendamento",
        "Grupo_Comp_letra"
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = $1
        AND DATE("Dt_Agendamento") BETWEEN $2::date AND $3::date
        AND "Dt_Cancela_saida" IS NULL
        AND "Dt_Desistencia" IS NULL
      ORDER BY "Dt_Agendamento", "ID"
      `,
      [pb, startStr, endStr]
    );

    const agendamentos = Object.create(null);

    for (const r of agResult.rows) {
      const dataLocal = parseDbDateAsLocal(r["Dt_Agendamento"]);
      if (!dataLocal) continue;

      const d = formatDateLocal(dataLocal);
      const grupo = String(r["Grupo_Comp_letra"] || "").trim().toUpperCase();

      if (!agendamentos[d]) {
        agendamentos[d] = grupo || "AG";
      }
    }

    // ================================
    // FERIADOS
    // ================================

    const ferResult = await pool.query(
      `
      SELECT "Dt_Feriado"
      FROM public."Agenda_comp_02_feriados"
      WHERE "Dt_Exclusao" IS NULL
        AND DATE("Dt_Feriado") BETWEEN $1::date AND $2::date
      ORDER BY "Dt_Feriado"
      `,
      [startStr, endStr]
    );

    const feriados = Object.create(null);

    for (const r of ferResult.rows) {
      const dataLocal = parseDbDateAsLocal(r["Dt_Feriado"]);
      if (!dataLocal) continue;

      const d = formatDateLocal(dataLocal);
      feriados[d] = true;
    }

    // ================================
    // GERA CALENDÁRIO (LÓGICA DO VBA)
    // ================================

    const resp = [];
    let cur = new Date(startDate);
    let emSeqFeriado = false;

    while (cur <= endDate) {
      const d = formatDateLocal(cur);
      const dow = cur.getDay(); // 0=Dom, 1=Seg
      const ehFeriado = !!feriados[d];

      let status = "free";
      let label = null;

      // ========================
      // LÓGICA DO VBA
      // ========================

      if (emSeqFeriado) {
        if (ehFeriado) {
          status = "holiday";
          label = "F";
        } else if (dow !== 0) {
          status = "folga";
          label = "fol";
          emSeqFeriado = false;
        } else {
          emSeqFeriado = false;
        }
      } else if (dow === 1) {
        if (ehFeriado) {
          status = "holiday";
          label = "F";
          emSeqFeriado = true;
        } else {
          status = "folga";
          label = "fol";
        }
      } else if (ehFeriado) {
        status = "holiday";
        label = "F";
      }

      // ========================
      // AGENDAMENTO NÃO SOBRESCREVE FOLGA
      // ========================

      if (status !== "folga" && agendamentos[d]) {
        status = "busy";
        label = agendamentos[d];
      }

      resp.push({
        date: d,
        status,
        label,
      });

      cur = addDays(cur, 1);
    }

    return res.status(200).json(resp);

  } catch (err) {
    console.error("ERRO availability:", err);
    return res.status(500).json({
      error: "Erro interno ao carregar disponibilidade",
      detail: err.message,
    });
  }
}
