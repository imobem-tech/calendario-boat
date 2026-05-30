// ============================================================
// /api/availability
// Allmax Gestão de Cotas — V.2605252310
// Retorna disponibilidade do calendário por PB/mês.
// Dias ocupados agora incluem: id, grupo (para cancelamento).
// ============================================================

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

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  return null;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function handler(req, res) {
  try {
    const pb     = parseInt(req.query.pb, 10);
    const start  = req.query.start || formatDateLocal(new Date());
    const months = parseInt(req.query.months || "1", 10);

    if (!pb || pb <= 0)      return res.status(400).json({ error: "pb inválido" });
    if (!months || months <= 0) return res.status(400).json({ error: "months inválido" });

    const startDate = new Date(start + "T00:00:00");
    if (isNaN(startDate.getTime())) return res.status(400).json({ error: "start inválido" });

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);
    endDate.setDate(endDate.getDate() - 1);

    const startStr = formatDateLocal(startDate);
    const endStr   = formatDateLocal(endDate);

    // ============================================================
    // AGENDAMENTOS — inclui id e grupo no retorno
    // ============================================================
    const agResult = await pool.query(
      `SELECT
         "ID"                AS id,
         "Código"            AS codigo,
         "Dt_Agendamento"    AS dt_agendamento,
         "Grupo_Comp_letra"  AS grupo,
         "Cod_Autorizado"    AS cod_autorizado,
         TO_CHAR("Dt_Agendamento", 'HH24:MI') AS hora
       FROM public."P_BOAT_z_10_Saida_Emb"
       WHERE "Cod_Emb_PB" = $1
         AND "Dt_Cancela_saida" IS NULL
         AND "Dt_Desistencia"   IS NULL
         AND DATE("Dt_Agendamento") BETWEEN $2::date AND $3::date
       ORDER BY DATE("Dt_Agendamento"), "ID"`,
      [pb, startStr, endStr]
    );

    // Mapa: data → { grupo, id, codAutorizado, hora }
    const agendamentos = Object.create(null);

    for (const r of agResult.rows) {
      const dataLocal = parseDbDateAsLocal(r.dt_agendamento);
      if (!dataLocal) continue;

      const d     = formatDateLocal(dataLocal);
      const grupo = String(r.grupo || "").trim().toUpperCase();

      if (!agendamentos[d]) {
        agendamentos[d] = {
          grupo:         grupo || "AG",
          id:            r.id,
          codAutorizado: r.cod_autorizado,
          hora:          r.hora || ""
        };
      }
    }

    // ============================================================
    // FERIADOS
    // ============================================================
    const ferResult = await pool.query(
      `SELECT "Dt_Feriado" AS dt_feriado
         FROM public."Agenda_comp_02_feriados"
        WHERE "Dt_Exclusao" IS NULL
          AND DATE("Dt_Feriado") BETWEEN $1::date AND $2::date
        ORDER BY DATE("Dt_Feriado")`,
      [startStr, endStr]
    );

    const feriados = Object.create(null);
    for (const r of ferResult.rows) {
      const dataLocal = parseDbDateAsLocal(r.dt_feriado);
      if (!dataLocal) continue;
      feriados[formatDateLocal(dataLocal)] = true;
    }

    // ============================================================
    // GERA CALENDÁRIO
    // ============================================================
    const resp = [];
    let cur = new Date(startDate);
    let emSeqFeriado = false;

    while (cur <= endDate) {
      const d        = formatDateLocal(cur);
      const dow      = cur.getDay();
      const ehFeriado = !!feriados[d];

      let status = "free";
      let label  = null;

      if (emSeqFeriado) {
        if (ehFeriado) {
          status = "holiday"; label = "F";
        } else if (dow !== 0) {
          status = "folga"; label = "fol"; emSeqFeriado = false;
        } else {
          emSeqFeriado = false;
        }
      } else if (dow === 1) {
        if (ehFeriado) {
          status = "holiday"; label = "F"; emSeqFeriado = true;
        } else {
          status = "folga"; label = "fol";
        }
      } else if (ehFeriado) {
        status = "holiday"; label = "F";
      }

      // Folga não é sobrescrita por agendamento
      if (status !== "folga" && agendamentos[d]) {
        const ag = agendamentos[d];
        status = "busy";
        label  = ag.grupo;

        resp.push({
          date:          d,
          status,
          label,
          holiday:       ehFeriado,
          agendamentoId: ag.id,
          grupo:         ag.grupo,
          codAutorizado: ag.codAutorizado,
          hora:          ag.hora
        });

        cur = addDays(cur, 1);
        continue;
      }

      resp.push({ date: d, status, label, holiday: ehFeriado });
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
