// ============================================================
// /api/config_horarios — V.260624145000
// Allmax Gestão de Cotas — Marujo⚓
// Retorna configuração de horários baseado no tipo de cliente
// ============================================================
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const VERSAO_API = "config_horarios_v260624145000";

// Código do proprietário ALLMAX
const COD_PROPRIETARIO_ALLMAX = 4255;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método não permitido",
      versao: VERSAO_API
    });
  }

  const { pb, data } = req.query;

  if (!pb) {
    return res.status(400).json({
      error: "PB não informado",
      versao: VERSAO_API
    });
  }

  let client;

  try {
    client = await pool.connect();

    // Buscar proprietário da embarcação
    const rsEmb = await client.query(
      `SELECT "Cod_Cliente"
       FROM public."P_BOAT_1_Embarcacao"
       WHERE "Num_PB" = $1`,
      [Number(pb)]
    );

    if (rsEmb.rowCount === 0) {
      return res.status(404).json({
        error: `Embarcação PB ${pb} não encontrada`,
        versao: VERSAO_API
      });
    }

    const codProprietario = rsEmb.rows[0].Cod_Cliente;
    const ehAllmax = codProprietario === COD_PROPRIETARIO_ALLMAX;

    // Configuração base
    const config = {
      pb: Number(pb),
      ehAllmax,
      tipoCliente: ehAllmax ? "ALLMAX" : "SUMMER",
      antecedenciaMinima: 2, // sempre 2 horas para ambos
      horarioFim: 17,
      intervalo: 15,
      versao: VERSAO_API
    };

    // ALLMAX: horário fixo 11:00
    if (ehAllmax) {
      config.horarioInicio = 11;
      config.horarioInicioLabel = "11:00";
      config.regra = "ALLMAX: horário fixo 11:00";

      return res.status(200).json(config);
    }

    // SUMMER: horário dinâmico baseado em antecedência
    if (!data) {
      // Se não informou data, retorna configuração padrão
      config.horarioInicio = 11;
      config.horarioInicioLabel = "11:00";
      config.regra = "SUMMER: sem data informada, assumindo < 17h (inicia às 11:00)";

      return res.status(200).json(config);
    }

    // Calcular antecedência em horas
    const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dataDesejada = new Date(`${data}T00:00:00-03:00`); // GMT-3

    const diferencaMs = dataDesejada - agora;
    const antecedenciaHoras = diferencaMs / (1000 * 60 * 60);

    // SUMMER: se antecedência >= 17h → inicia às 09:00, senão 11:00
    if (antecedenciaHoras >= 17) {
      config.horarioInicio = 9;
      config.horarioInicioLabel = "09:00";
      config.antecedenciaCalculada = Math.floor(antecedenciaHoras * 10) / 10;
      config.regra = "SUMMER: antecedência ≥ 17h (inicia às 09:00)";
    } else {
      config.horarioInicio = 11;
      config.horarioInicioLabel = "11:00";
      config.antecedenciaCalculada = Math.floor(antecedenciaHoras * 10) / 10;
      config.regra = "SUMMER: antecedência < 17h (inicia às 11:00)";
    }

    return res.status(200).json(config);

  } catch (err) {
    console.error("[config_horarios] Erro:", err);
    return res.status(500).json({
      error: err.message || "Erro interno",
      versao: VERSAO_API
    });
  } finally {
    if (client) client.release();
  }
}
