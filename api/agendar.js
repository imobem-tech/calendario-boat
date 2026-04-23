import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const MAP = {
  a: "1", b: "2", c: "3", d: "4", e: "5",
  f: "6", g: "7", h: "8", i: "9", j: "0"
};

function decodificar(txt) {
  return String(txt || "")
    .split("")
    .map(ch => MAP[ch] || "")
    .join("");
}

function calcularDV(pb, grupoNum, autorizado) {
  const base = `${pb}${grupoNum}${autorizado}`;
  const soma = base.split("").reduce((acc, n) => acc + Number(n), 0);
  return String(soma).padStart(2, "0");
}

function decodeToken(token) {
  const t = String(token || "").trim().toLowerCase();

  const m = t.match(/^([a-j]+)([a-z])([a-j])([a-j]{4})([a-j]{2})$/);
  if (!m) return null;

  const pb = decodificar(m[1]);
  const grupoLetra = m[2].toUpperCase();
  const grupoNum = decodificar(m[3]);
  const autorizado = decodificar(m[4]);
  const dv = decodificar(m[5]);

  if (!pb || !grupoNum || !autorizado || !dv) return null;

  const dvCalc = calcularDV(pb, grupoNum, autorizado);
  if (dv !== dvCalc) return null;

  return {
    pb,
    grupo: `${grupoLetra}${grupoNum}`, // ex.: X4
    codAutorizado: autorizado
  };
}

function extrairLimiteDoGrupo(grupo) {
  const m = String(grupo || "").match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  let client;

  try {
    const { token, data, hora } = req.body || {};

    if (!token || !data || !hora) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    const acesso = decodeToken(token);
    if (!acesso) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const codEmbPB = Number(acesso.pb);
    const codAutorizado = Number(acesso.codAutorizado);
    const grupo = acesso.grupo;
    const limiteGrupo = extrairLimiteDoGrupo(grupo);

    if (!codEmbPB || !codAutorizado || !grupo || !limiteGrupo) {
      return res.status(400).json({ error: "Dados do token inválidos." });
    }

    // Pela sua regra, a validação é por DIA, não por data/hora.
    // Se quiser manter o horário só para exibição no front, tudo bem,
    // mas ele não está sendo gravado nessa tabela.
    const dataAgendamento = data; // yyyy-mm-dd

    client = await pool.connect();
    await client.query("BEGIN");

    // 1) Verifica se a embarcação já tem agendamento ABERTO no mesmo dia
    const conflitoDia = await client.query(
      `SELECT 1
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND "Dt_Agendamento"::date = $2::date
          AND "Dt_Desistencia" IS NULL
          AND "Dt_Cancela_saida" IS NULL
        LIMIT 1`,
      [codEmbPB, dataAgendamento]
    );

    if (conflitoDia.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `A embarcação ${codEmbPB} já possui agendamento em aberto para o dia selecionado.`
      });
    }

    // 2) Conta quantos agendamentos em aberto existem, a partir de hoje,
    // para o mesmo autorizado + embarcação + grupo
    const emAberto = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND "Cod_Autorizado" = $2
          AND "Grupo_Comp_letra" = $3
          AND "Dt_Agendamento"::date >= CURRENT_DATE
          AND "Dt_Desistencia" IS NULL
          AND "Dt_Cancela_saida" IS NULL`,
      [codEmbPB, codAutorizado, grupo]
    );

    const totalEmAberto = emAberto.rows[0]?.total || 0;

    if (totalEmAberto >= limiteGrupo) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Limite do grupo (${limiteGrupo}) atingido.`
      });
    }

    // 3) Insere o agendamento
    await client.query(
      `INSERT INTO public."P_BOAT_z_10_Saida_Emb"
       (
         "Cod_Emb_PB",
         "Cod_Proprietário",
         "Cod_Autorizado",
         "Dt_Solicitacao",
         "Dt_Agendamento",
         "Grupo_Comp_letra",
         "updated_at"
       )
       VALUES ($1, $2, $3, CURRENT_DATE, $4::date, $5, CURRENT_DATE)`,
      [
        codEmbPB,
        4255,
        codAutorizado,
        dataAgendamento,
        grupo
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      msg: `Agendamento realizado com sucesso para ${dataAgendamento} às ${hora}.`
    });

  } catch (err) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    return res.status(500).json({
      error: err.message || "Erro interno"
    });
  } finally {
    if (client) client.release();
  }
}
