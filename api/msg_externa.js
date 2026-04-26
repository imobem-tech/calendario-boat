import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function parsePbCota(input) {
  input = String(input || "").toUpperCase().trim();

  const match = input.match(/^(\d+)([A-Z]\d+)$/);
  if (match) {
    return {
      pb: parseInt(match[1], 10),
      cota: match[2]
    };
  }

  if (input.endsWith("00")) {
    return {
      pb: parseInt(input.slice(0, -2), 10),
      cota: null
    };
  }

  throw new Error("Formato inválido. Use 576X1 ou 57600");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Use POST" });
  }

  try {
    const { pb_cota, mensagem } = req.body;

    if (!pb_cota || !mensagem) {
      return res.status(400).json({
        erro: "pb_cota e mensagem são obrigatórios"
      });
    }

    const { pb, cota } = parsePbCota(pb_cota);

    let result;

    if (cota) {
      result = await pool.query(
        `SELECT grupowppid
         FROM public.wpp_grupos_agenda
         WHERE pb = $1
           AND UPPER(COALESCE(cota, '')) = UPPER($2)
         LIMIT 1`,
        [pb, cota]
      );
    } else {
      result = await pool.query(
        `SELECT grupowppid
         FROM public.wpp_grupos_agenda
         WHERE pb = $1
           AND cota IS NULL
         LIMIT 1`,
        [pb]
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({
        erro: "Grupo não encontrado",
        pb,
        cota
      });
    }

    const grupoId = result.rows[0].grupowppid;

    await pool.query(
      `INSERT INTO public.wpp_fila_agenda
       (grupo_id, mensagem, status, data_criacao)
       VALUES ($1, $2, 'pendente', NOW())`,
      [grupoId, mensagem]
    );

    return res.status(200).json({
      sucesso: true,
      grupo_id: grupoId
    });

  } catch (err) {
    console.error("ERRO /api/msg_externa:", err);

    return res.status(500).json({
      erro: err.message
    });
  }
}
