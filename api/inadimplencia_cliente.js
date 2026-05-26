// ============================================================
// /api/inadimplencia_cliente
// Allmax Gestão de Cotas
// Verifica inadimplência do cotista.
// Se inadimplente:
//   1. Envia relatório CR no privado do cliente (Cliente_Telefone_Celular)
//   2. Espelha no grupo ESPELHO_FINANCEIRO (log gerencial)
//
// GET /api/inadimplencia_cliente?codAutorizado=4307&pb=576&grupo=X4
//
// Retorna:
//   { inadimplente: false }
//   { inadimplente: true, privadoEnviado: true|false, espelhoEnviado: true|false }
// ============================================================

import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®2605261040";

const ESPELHO_FINANCEIRO_ID = process.env.ESPELHO_FINANCEIRO_ID || "120363424805097946@g.us";
const BOT_URL = process.env.BOT_URL || "https://calendario-boat-desenvolvimento.up.railway.app";

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

function somenteDigitos(txt) {
  return String(txt || "").replace(/\D+/g, "");
}

function montarMensagemCR(faturas) {
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

  linhas.push("_Caso não reconheça a conta, favor comunicar, para que se proceda o ajuste/baixa._");
  linhas.push("_Desconsidere caso já tenha quitado, a baixa bancária pode demorar até 2 dias._");

  return linhas.join("\n");
}

// ------------------------------------------------------------
// Envia mensagem via bot (rota /msg_externa)
// ------------------------------------------------------------

async function enviarViaBot(jid, mensagem) {
  const resp = await fetch(`${BOT_URL}/enviar-jid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid, mensagem })
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Bot retornou ${resp.status}: ${txt}`);
  }
  return true;
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

    // Q1 — Portão
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

    // Q2 — Faturas vencidas
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
    console.log(`[inadimplencia] DEBUG totalFaturas=${faturas.length} codAutorizado=${codAutorizado}`);

    // Q3 — Nome e telefone do cliente
    const rsCliente = await client.query(
      `SELECT "Cliente_Nome" AS nome, "Cliente_Telefone_Celular" AS telefone
         FROM public."Cliente"
        WHERE "Codigo" = $1
        LIMIT 1`,
      [codAutorizado]
    );

    const nomeCliente   = rsCliente.rows[0]?.nome     || `Cód. ${codAutorizado}`;
    const telefoneBruto = rsCliente.rows[0]?.telefone || null;
    console.log(`[inadimplencia] DEBUG nomeCliente="${nomeCliente}" telefone="${telefoneBruto}"`);

    let privadoEnviado = false;
    let espelhoEnviado = false;

    console.log(`[inadimplencia] DEBUG dispararWpp=${dispararWpp}`);

    if (dispararWpp) {
      const mensagemCR = montarMensagemCR(faturas);

      // 1. Privado do cliente
      if (telefoneBruto) {
        const tel = somenteDigitos(telefoneBruto);
        let jid = tel.startsWith("55") ? tel : "55" + tel;
        if (jid.length === 12) jid = jid.slice(0, 4) + "9" + jid.slice(4);
        jid = jid + "@s.whatsapp.net";
        console.log(`[inadimplencia] DEBUG chamando enviarViaBot privado jid=${jid} BOT_URL=${BOT_URL}`);

        try {
          await enviarViaBot(jid, mensagemCR);
          privadoEnviado = true;
          console.log(`[inadimplencia] Privado enviado: ${jid}`);
        } catch (err) {
          console.warn(`[inadimplencia] Falha privado ${jid}:`, err.message);
        }
      } else {
        console.warn(`[inadimplencia] Sem telefone para Cód. ${codAutorizado}`);
      }

      // 2. Espelho gerencial
      const mensagemEspelho =
        `👤 *${nomeCliente}* (Cód. ${codAutorizado})\n` +
        `📱 ${telefoneBruto || "sem telefone"}\n\n` +
        mensagemCR;

      console.log(`[inadimplencia] DEBUG chamando enviarViaBot espelho jid=${ESPELHO_FINANCEIRO_ID}`);
      try {
        await enviarViaBot(ESPELHO_FINANCEIRO_ID, mensagemEspelho);
        espelhoEnviado = true;
        console.log(`[inadimplencia] Espelho enviado`);
      } catch (err) {
        console.warn(`[inadimplencia] Falha espelho:`, err.message);
      }
    }

    return res.status(200).json({
      inadimplente: true,
      totalFaturas: faturas.length,
      privadoEnviado,
      espelhoEnviado,
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
