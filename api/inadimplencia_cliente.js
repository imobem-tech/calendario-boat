// ============================================================
// /api/inadimplencia
// Allmax Gestão de Cotas
// Verifica inadimplência do cotista e enfileira WPP se houver
// contas vencidas a mais de 3 dias.
//
// GET /api/inadimplencia?codAutorizado=4307&pb=576&grupo=X4
//
// Retorna:
//   { inadimplente: false }
//   { inadimplente: true, wppEnfileirado: true }
// ============================================================

import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®2605222011";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ------------------------------------------------------------
// Helpers de formatação
// ------------------------------------------------------------

function formatarValorBR(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function montarMensagemWpp(faturas) {
  const linhas = ["⚠️ *Informações sobre Contas em Aberto*\n"];

  for (const f of faturas) {
    linhas.push(`*${f.descricao}*`);
    linhas.push(`  | Valor Original: R$ ${formatarValorBR(f.valor)}`);
    linhas.push(`  | Vencimento: ${f.vencimento}`);

    if (f.link && f.link.trim()) {
      linhas.push(`  | Link:`);
      linhas.push(`  | ${f.link.trim()}`);
    }

    linhas.push("");
  }

  linhas.push(
    "_Caso tenha havido o pagamento, favor comunicar, para que se verifique sobre a baixa._"
  );

  return linhas.join("\n");
}

// ------------------------------------------------------------
// Busca grupos WPP do cotista (reutiliza lógica do agendar)
// ------------------------------------------------------------

async function buscarGruposWpp(client, pb, grupo) {
  // Tenta pelo par pb + cota exata
  const rsCota = await client.query(
    `SELECT grupowppid, nomegrupowpp
       FROM public.wpp_grupos_agenda
      WHERE pb = $1
        AND UPPER(COALESCE(cota, '')) = UPPER($2)
      ORDER BY nomegrupowpp`,
    [pb, grupo || ""]
  );

  if (rsCota.rowCount > 0) return rsCota.rows;

  // Fallback: grupo geral do PB (cota IS NULL)
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

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido", versao: VERSAO_API });
  }

  const codAutorizado = Number(req.query.codAutorizado);
  const pb            = Number(req.query.pb);
  const grupo         = String(req.query.grupo || "").trim().toUpperCase();

  if (!codAutorizado || !pb || !grupo) {
    return res.status(400).json({
      error: "Parâmetros obrigatórios: codAutorizado, pb, grupo",
      versao: VERSAO_API
    });
  }

  let client;

  try {
    client = await pool.connect();

    // ----------------------------------------------------------
    // Q1 — Portão: existe conta vencida há mais de 3 dias?
    // Custo mínimo: EXISTS para na primeira linha encontrada.
    // ----------------------------------------------------------
    const rsExiste = await client.query(
      `SELECT EXISTS (
         SELECT 1
           FROM public."Contas_Receber"
          WHERE "Código_Cliente" = $1
            AND "Data_Pagamento" IS NULL
            AND "Data_Vencimento" < CURRENT_DATE - INTERVAL '3 days'
       ) AS inadimplente`,
      [codAutorizado]
    );

    const inadimplente = rsExiste.rows[0]?.inadimplente === true;

    if (!inadimplente) {
      return res.status(200).json({ inadimplente: false, versao: VERSAO_API });
    }

    // ----------------------------------------------------------
    // Q2 — Listagem: todas as faturas vencidas até hoje
    // Só roda se Q1 confirmou inadimplência.
    // ----------------------------------------------------------
    const rsFaturas = await client.query(
      `SELECT "Descrição"                              AS descricao,
              "Valor"                                  AS valor,
              TO_CHAR("Data_Vencimento", 'DD/MM/YYYY') AS vencimento,
              "Centro_Custo"                           AS link
         FROM public."Contas_Receber"
        WHERE "Código_Cliente" = $1
          AND "Data_Pagamento" IS NULL
          AND "Data_Vencimento" < CURRENT_DATE
        ORDER BY "Data_Vencimento"`,
      [codAutorizado]
    );

    const faturas = rsFaturas.rows;

    // ----------------------------------------------------------
    // Enfileira mensagem WPP para o grupo do cotista
    // ----------------------------------------------------------
    let wppEnfileirado = false;
    let wppGrupos      = [];

    try {
      const grupos = await buscarGruposWpp(client, pb, grupo);

      if (grupos.length) {
        const mensagem = montarMensagemWpp(faturas);

        for (const g of grupos) {
          await client.query(
            `INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
             VALUES ($1, $2, 'pendente')`,
            [g.grupowppid, mensagem]
          );
          wppGrupos.push(g.nomegrupowpp);
        }

        wppEnfileirado = true;
      } else {
        console.warn(`[inadimplencia] Nenhum grupo WPP encontrado para PB ${pb} / Grupo ${grupo}`);
      }
    } catch (wppErr) {
      // Falha no WPP não bloqueia a resposta de inadimplência
      console.error("[inadimplencia] Erro ao enfileirar WPP:", wppErr.message);
    }

    return res.status(200).json({
      inadimplente: true,
      totalFaturas: faturas.length,
      wppEnfileirado,
      wppGrupos,
      versao: VERSAO_API
    });

  } catch (err) {
    console.error("[inadimplencia] Erro:", err.message);
    return res.status(500).json({
      error: err.message || "Erro interno",
      versao: VERSAO_API
    });
  } finally {
    if (client) client.release();
  }
}
