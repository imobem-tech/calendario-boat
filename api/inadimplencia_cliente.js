// ============================================================
// /api/inadimplencia_cliente
// Allmax Gestão de Cotas
// Verifica inadimplência do cotista e enfileira WPP se houver
// contas vencidas a mais de 3 dias.
//
// GET /api/inadimplencia_cliente?codAutorizado=4307&pb=576&grupo=X4
//
// Retorna:
//   { inadimplente: false }
//   { inadimplente: true, wppEnfileirado: true, grupowppid: "..." }
// ============================================================

import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®2605252145";

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

    const link = String(f.link || "").trim();
    if (link) {
      linhas.push(`  | Link:`);
      linhas.push(`  | ${link}`);
    }

    linhas.push("");
  }

  linhas.push(
    "_Caso não reconheça a conta, favor comunicar, para que se proceda o ajuste/baixa._"
  );
  linhas.push(
    "_Desconsidere caso já tenha quitado, a baixa bancária pode demorar até 2 dias._"
  );

  return linhas.join("\n");
}

// ------------------------------------------------------------
// Busca grupos WPP do cotista
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
  const dispararWpp   = req.query.dispararWpp !== "false"; // default true

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
    // EXISTS para na primeira linha encontrada — custo mínimo.
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
    // Q2 — Listagem: todas as faturas vencidas até hoje.
    // Link em agendamento_obs (campo correto do Asaas).
    // Só roda se Q1 confirmou inadimplência.
    // ----------------------------------------------------------
    const rsFaturas = await client.query(
      `SELECT "Descrição"                              AS descricao,
              "Valor"                                  AS valor,
              TO_CHAR("Data_Vencimento", 'DD/MM/YYYY') AS vencimento,
              COALESCE(NULLIF(TRIM("agendamento_obs"), ''), '') AS link
         FROM public."Contas_Receber"
        WHERE "Código_Cliente" = $1
          AND "Data_Pagamento" IS NULL
          AND "Data_Vencimento" < CURRENT_DATE
        ORDER BY "Data_Vencimento"`,
      [codAutorizado]
    );

    const faturas = rsFaturas.rows;

    // ----------------------------------------------------------
    // Enfileira mensagem WPP — apenas se solicitado pelo frontend.
    // O frontend controla via sessionStorage para disparar só uma
    // vez por sessão (enquanto a aba estiver aberta).
    // ----------------------------------------------------------
    let wppEnfileirado = false;
    let wppGrupos      = [];
    let grupowppid     = null;

    if(dispararWpp){
      try {
        const grupos = await buscarGruposWpp(client, pb, grupo);

        if (grupos.length) {
          grupowppid = grupos[0].grupowppid;

          const mensagem = montarMensagemWpp(faturas);

          await client.query("BEGIN");
          for (const g of grupos) {
            await client.query(
              `INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
               VALUES ($1, $2, 'pendente')`,
              [g.grupowppid, mensagem]
            );
            wppGrupos.push(g.nomegrupowpp);
          }
          await client.query("COMMIT");

          wppEnfileirado = true;
        } else {
          console.warn(`[inadimplencia_cliente] Nenhum grupo WPP encontrado para PB ${pb} / Grupo ${grupo}`);
        }
      } catch (wppErr) {
        try { await client.query("ROLLBACK"); } catch {}
        console.error("[inadimplencia_cliente] Erro ao enfileirar WPP:", wppErr.message);
      }
    }

    return res.status(200).json({
      inadimplente: true,
      totalFaturas: faturas.length,
      wppEnfileirado,
      wppGrupos,
      grupowppid,
      versao: VERSAO_API
    });

  } catch (err) {
    console.error("[inadimplencia_cliente] Erro:", err.message);
    return res.status(500).json({
      error: err.message || "Erro interno",
      versao: VERSAO_API
    });
  } finally {
    if (client) client.release();
  }
}
