const express = require("express");
const router = express.Router();
const pool = require("./db"); // ajuste conforme seu projeto

function parsePbCota(input) {
  input = input.toUpperCase().trim();

  const match = input.match(/^(\d+)([A-Z]\d+)$/);
  if (match) {
    return {
      pb: parseInt(match[1]),
      cota: match[2]
    };
  }

  if (input.endsWith("00")) {
    return {
      pb: parseInt(input.slice(0, -2)),
      cota: null
    };
  }

  throw new Error("Formato inválido. Use 576X1 ou 57600");
}

router.post("/msg_externa", async (req, res) => {
  try {
    const { pb_cota, mensagem } = req.body;

    if (!pb_cota || !mensagem) {
      return res.status(400).json({ erro: "pb_cota e mensagem são obrigatórios" });
    }

    const { pb, cota } = parsePbCota(pb_cota);

    let grupo;

    if (cota) {
      // Busca com cota
      const result = await pool.query(
        `SELECT grupowppid 
         FROM wpp_grupos_agenda 
         WHERE pb = $1 AND cota = $2
         LIMIT 1`,
        [pb, cota]
      );

      grupo = result.rows[0];
    } else {
      // Busca somente PB
      const result = await pool.query(
        `SELECT grupowppid 
         FROM wpp_grupos_agenda 
         WHERE pb = $1 AND cota IS NULL
         LIMIT 1`,
        [pb]
      );

      grupo = result.rows[0];
    }

    if (!grupo) {
      return res.status(404).json({
        erro: "Grupo não encontrado para esse PB/Cota"
      });
    }

    // Insere na fila
    await pool.query(
      `INSERT INTO wpp_fila_agenda (grupo_id, mensagem, status, data_criacao)
       VALUES ($1, $2, 'pendente', NOW())`,
      [grupo.grupowppid, mensagem]
    );

    return res.json({
      sucesso: true,
      grupo: grupo.grupowppid
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      erro: err.message
    });
  }
});

module.exports = router;
