// ============================================================
// /api/desistencia
// Allmax Gestão de Cotas — V.2605252310
// Cancela agendamento: grava Dt_Desistencia e enfileira WPP.
//
// POST /api/desistencia
// Body: { token, agendamentoId }
// ============================================================

import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®2605252310";
const VERSAO_WPP = process.env.VERSAO_WPP || "Allmax®2605252310";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const MAP = {
  a:"1", b:"2", c:"3", d:"4", e:"5",
  f:"6", g:"7", h:"8", i:"9", j:"0"
};

function decodificar(txt) {
  return String(txt || "").split("").map(ch => MAP[ch] || "").join("");
}

function calcularDV(pb, grupoNum, autorizado) {
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mm    = String(agora.getMonth() + 1).padStart(2, "0");
  const dd    = String(agora.getDate()).padStart(2, "0");
  const base  = `${pb}${grupoNum}${autorizado}${mm}${dd}`;
  const soma  = base.split("").reduce((acc, n) => acc + Number(n), 0);
  return String(soma).padStart(2, "0");
}

function decodeToken(token) {
  const t = String(token || "").trim().toLowerCase();
  const m = t.match(/^([a-j]+)([a-z0-9])([a-j]+)([a-j]{4})([a-j]{4})([a-j]{2})$/);
  if (!m) return null;

  const pb           = decodificar(m[1]);
  const grupoLetra   = m[2].toUpperCase();
  const grupoNum     = decodificar(m[3]);
  const autorizado   = decodificar(m[4]);
  const mmdd         = decodificar(m[5]).padStart(4, "0");
  const dv           = decodificar(m[6]);

  if (!pb || !grupoNum || !autorizado || !dv) return null;

  const agora    = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mmHoje   = String(agora.getMonth() + 1).padStart(2, "0");
  const ddHoje   = String(agora.getDate()).padStart(2, "0");
  const mmddHoje = `${mmHoje}${ddHoje}`;

  if (mmdd !== mmddHoje) return null;

  const dvCalc       = calcularDV(pb, grupoNum, autorizado);
  if (dv !== dvCalc) return null;

  const primeiroGrupo = decodificar(m[2]);
  const grupoFinal    = primeiroGrupo ? `${primeiroGrupo}${grupoNum}` : `${grupoLetra}${grupoNum}`;

  return { pb, grupo: grupoFinal, codAutorizado: autorizado, token: t };
}

function agoraSaoPaulo() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function formatarDataHoraBR(dt) {
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function formatarDataBR(dtAgendamento) {
  // dtAgendamento pode ser Date ou string ISO
  const dt = dtAgendamento instanceof Date ? dtAgendamento : new Date(dtAgendamento);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

async function buscarGruposWpp(client, pb, grupo) {
  const rsCota = await client.query(
    `SELECT grupowppid, nomegrupowpp
       FROM public.wpp_grupos_agenda
      WHERE pb = $1
        AND UPPER(COALESCE(cota, '')) = UPPER($2)
      ORDER BY nomegrupowpp`,
    [pb, grupo || ""]
  );
  if (rsCota.rowCount > 0) return rsCota.rows;

  const rsGeral = await client.query(
    `SELECT grupowppid, nomegrupowpp
       FROM public.wpp_grupos_agenda
      WHERE pb = $1
        AND cota IS NULL
      ORDER BY nomegrupowpp`,
    [pb]
  );
  return rsGeral.rows;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido", versao: VERSAO_API });
  }

  const { token, agendamentoId } = req.body || {};

  if (!token || !agendamentoId) {
    return res.status(400).json({ error: "Dados incompletos: token e agendamentoId obrigatórios", versao: VERSAO_API });
  }

  const acesso = decodeToken(token);
  if (!acesso) {
    return res.status(400).json({ error: "Token inválido ou expirado", versao: VERSAO_API });
  }

  const codEmbPB     = Number(acesso.pb);
  const codAutorizado = Number(acesso.codAutorizado);
  const grupo        = acesso.grupo;

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Busca o agendamento — valida que pertence ao cotista e à embarcação correta
    const rsAg = await client.query(
      `SELECT "ID", "Código", "Dt_Agendamento", "Grupo_Comp_letra",
              "Cod_Emb_PB", "Cod_Autorizado",
              "Dt_Desistencia", "Dt_Cancela_saida", "Dt_Saída"
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "ID" = $1
          AND "Cod_Emb_PB" = $2
          AND "Cod_Autorizado" = $3
        LIMIT 1`,
      [agendamentoId, codEmbPB, codAutorizado]
    );

    if (rsAg.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Agendamento não encontrado ou não pertence a este cotista", versao: VERSAO_API });
    }

    const ag = rsAg.rows[0];

    if (ag.Dt_Desistencia) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Agendamento já está cancelado", versao: VERSAO_API });
    }

    if (ag.Dt_Cancela_saida) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Agendamento já foi cancelado administrativamente", versao: VERSAO_API });
    }

    if (ag["Dt_Saída"]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Saída já realizada, não é possível cancelar", versao: VERSAO_API });
    }

    // Grava desistência
    const agora = agoraSaoPaulo();

    await client.query(
      `UPDATE public."P_BOAT_z_10_Saida_Emb"
          SET "Dt_Desistencia" = $1
        WHERE "ID" = $2`,
      [agora, ag.ID]
    );

    await client.query("COMMIT");

    const dtAgendadaBR  = formatarDataBR(ag.Dt_Agendamento);
    const dtDesistBR    = formatarDataHoraBR(agora);

    // Monta mensagem WPP
    const mensagemWpp =
`🚫 DESISTÊNCIA DE AGENDAMENTO
PB: ${codEmbPB}
Grupo: ${ag.Grupo_Comp_letra}
Autorizado: ${codAutorizado}
Dt Agendada: ${dtAgendadaBR}
Dt Desistência: ${dtDesistBR}
Código: ${ag.Código}

${VERSAO_WPP}`;

    // Enfileira WPP
    try {
      const grupos = await buscarGruposWpp(client, codEmbPB, grupo);
      for (const g of grupos) {
        await client.query(
          `INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
           VALUES ($1, $2, 'pendente')`,
          [g.grupowppid, mensagemWpp]
        );
      }
    } catch (wppErr) {
      console.error("[desistencia] Erro ao enfileirar WPP:", wppErr.message);
    }

    return res.status(200).json({
      msg: `Agendamento cancelado. Data: ${dtAgendadaBR}`,
      versao: VERSAO_API
    });

  } catch (err) {
    if (client) { try { await client.query("ROLLBACK"); } catch {} }
    console.error("[desistencia] Erro:", err.message);
    return res.status(500).json({ error: err.message || "Erro interno", versao: VERSAO_API });
  } finally {
    if (client) client.release();
  }
}
