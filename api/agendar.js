import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
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
    grupo: `${grupoLetra}${grupoNum}`,
    codAutorizado: autorizado
  };
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
    const codAutorizadoNum = Number(acesso.codAutorizado);
    const grupoCompLetra = acesso.grupo;
    const dataHora = `${data}T${hora}:00`;

    client = await pool.connect();
    await client.query("BEGIN");

    const check = await client.query(
      `SELECT 1
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND "Dt_Agendamento" = $2
        LIMIT 1`,
      [codEmbPB, dataHora]
    );

    if (check.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Horário já ocupado." });
    }

    const resultMax = await client.query(
      `SELECT COALESCE(MAX("Código"), 0) AS max_codigo
         FROM public."P_BOAT_z_10_Saida_Emb"`
    );

    const maxCodigoAtual = Number(resultMax.rows[0].max_codigo) || 0;
    const codigo1 = maxCodigoAtual + 1;
    const codigo2 = maxCodigoAtual + 2;

    async function tentarInsert(codigo) {
      try {
        await client.query(
          `INSERT INTO public."P_BOAT_z_10_Saida_Emb"
           ("Código", "Cod_Emb_PB", "Cod_Proprietário", "Cod_Autorizado", "Grupo_Comp_letra", "Dt_Solicitacao", "Dt_Agendamento")
           VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
          [codigo, codEmbPB, 4255, codAutorizadoNum, grupoCompLetra, dataHora]
        );
        return codigo;
      } catch (err) {
        if (err.code === "23505") return null;
        throw err;
      }
    }

    let codigoGravado = await tentarInsert(codigo1);

    if (codigoGravado === null) {
      codigoGravado = await tentarInsert(codigo2);
    }

    if (codigoGravado === null) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Falha ao gerar Código único." });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      msg: "Agendamento realizado com sucesso.",
      codigo: codigoGravado
    });

  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    return res.status(500).json({
      error: err.message || "Erro interno"
    });
  } finally {
    if (client) client.release();
  }
}
