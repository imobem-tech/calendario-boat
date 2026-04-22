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

export default async function handler(req, res) {
  try {
    const pb = parseInt(req.query.pb, 10);
    const start = req.query.start || formatDateLocal(new Date());
    const months = parseInt(req.query.months || "1", 10);
    const debug = req.query.debug === "1";

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

    const agSql = `
      SELECT
        "ID",
        "Código",
        "Dt_Agendamento",
        "Dt_Saída",
        "Grupo_Comp_letra",
        "Dt_Cancela_saida",
        "Dt_Desistencia"
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = $1
        AND "Dt_Agendamento" >= $2::date
        AND "Dt_Agendamento" <= $3::date
        AND "Dt_Cancela_saida" IS NULL
        AND "Dt_Desistencia" IS NULL
      ORDER BY "Dt_Agendamento", "ID"
    `;

    const agResult = await pool.query(agSql, [pb, startStr, endStr]);

    const agendamentos = Object.create(null);
    const agDebug = [];

    for (const r of agResult.rows) {
      const bruto = r["Dt_Agendamento"];
      const dataLocal = parseDbDateAsLocal(bruto);

      agDebug.push({
        ID: r["ID"],
        Codigo: r["Código"],
        Dt_Agendamento_raw: bruto,
        Dt_Saida_raw: r["Dt_Saída"],
        Grupo: r["Grupo_Comp_letra"],
        DataInterpretada: dataLocal ? formatDateLocal(dataLocal) : null,
      });

      if (!dataLocal) continue;

      const d = formatDateLocal(dataLocal);
      const grupo = String(r["Grupo_Comp_letra"] || "").trim().toUpperCase();

      if (!agendamentos[d]) {
        agendamentos[d] = grupo || "AG";
      }
    }

    const ferSql = `
      SELECT "Dt_Feriado"
      FROM public."Agenda_comp_02_feriados"
      WHERE "Dt_Exclusao" IS NULL
        AND "Dt_Feriado" >= $1::date
        AND "Dt_Feriado" <= $2::date
      ORDER BY "Dt_Feriado"
    `;

    const ferResult = await pool.query(ferSql, [startStr, endStr]);

    const feriados = Object.create(null);
    const ferDebug = [];

    for (const r of ferResult.rows) {
      const dataLocal = parseDbDateAsLocal(r["Dt_Feriado"]);
      if (!dataLocal) continue;

      const d = formatDateLocal(dataLocal);
      feriados[d] = true;
      ferDebug.push(d);
    }

    const resp = [];
    let cur = new Date(startDate);
    let emSeqFeriado = false;

    while (cur <= endDate) {
      const d = formatDateLocal(cur);
      const dow = cur.getDay();
      const ehFeriado = !!feriados[d];

      let status = "free";
      let label = null;

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

      // igual ao VBA: não sobrescreve folga
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

    if (debug) {
      return res.status(200).json({
        params: { pb, startStr, endStr, months },
        agendamento_count: agResult.rows.length,
        agendamento_rows: agDebug,
        feriado_count: ferResult.rows.length,
        feriado_rows: ferDebug,
        agenda_map: agendamentos,
        calendario: resp,
      });
    }

    return res.status(200).json(resp);
  } catch (err) {
    console.error("ERRO availability:", err);
    return res.status(500).json({
      error: "Erro interno ao carregar disponibilidade",
      detail: err.message,
      stack: err.stack,
    });
  }
}
