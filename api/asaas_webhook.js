// ============================================================
// /api/asaas_webhook
// Allmax Gestão de Cotas — Baixa automática de CR
// V.2605272302
//
// Recebe eventos do Asaas (PAYMENT_RECEIVED / PAYMENT_CONFIRMED)
// e grava Data_Pagamento em public."Contas_Receber".
//
// Configurar UM webhook por empresa no painel Asaas:
//   Empresa 6 (Summer/Náutica): .../api/asaas_webhook?centro=6
//   Empresa 8 (Allmax):         .../api/asaas_webhook?centro=8
//   Empresa 9 (Imobem):         .../api/asaas_webhook?centro=9
//
// Variáveis de ambiente necessárias:
//   POSTGRES_URL  ou  DATABASE_URL
//   ASAAS_WEBHOOK_TOKEN_6   — access_token configurado no webhook da empresa 6
//   ASAAS_WEBHOOK_TOKEN_8   — idem empresa 8
//   ASAAS_WEBHOOK_TOKEN_9   — idem empresa 9
//
// Retorno sempre 200 para o Asaas (evita retentativas desnecessárias).
// Erros são logados mas não devolvem 5xx — o VBA continua como fallback.
// ============================================================

import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®V.2605272302";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ------------------------------------------------------------
// Tokens de validação por empresa
// Cada empresa tem seu próprio webhook no Asaas com token distinto
// ------------------------------------------------------------
const TOKENS_POR_CENTRO = {
  "6": process.env.ASAAS_WEBHOOK_TOKEN_6 || "",
  "8": process.env.ASAAS_WEBHOOK_TOKEN_8 || "",
  "9": process.env.ASAAS_WEBHOOK_TOKEN_9 || ""
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function agoraSaoPaulo() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
}

// Replica a lógica do VBA: vBase + vJuros + vMulta - vDesc
function calcularValorPago(payment) {
  const vBase  = parseFloat(payment.value         || 0);
  const vJuros = parseFloat(payment.interestValue || 0);
  const vMulta = parseFloat(payment.fineValue     || 0);
  const vDesc  = parseFloat(payment.discountValue || 0);
  return vBase + vJuros + vMulta - vDesc;
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
export default async function handler(req, res) {

  // Asaas só faz POST; qualquer outro método retorna 405
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido", versao: VERSAO_API });
  }

  // ----------------------------------------------------------
  // 1. Identifica empresa pelo parâmetro ?centro=
  // ----------------------------------------------------------
  const centro = String(req.query.centro || "").trim();

  if (!["6", "8", "9"].includes(centro)) {
    console.error(`[asaas_webhook] Parâmetro centro inválido: "${centro}"`);
    return res.status(200).json({ ok: false, motivo: "centro inválido", versao: VERSAO_API });
  }

  // ----------------------------------------------------------
  // 2. Valida token do webhook
  //    O Asaas envia o token configurado no header "asaas-access-token"
  // ----------------------------------------------------------
  const tokenEsperado = TOKENS_POR_CENTRO[centro];
  const tokenRecebido = req.headers["asaas-access-token"] || "";

  if (tokenEsperado && tokenRecebido !== tokenEsperado) {
    console.warn(`[asaas_webhook] Token inválido para centro ${centro}`);
    return res.status(200).json({ ok: false, motivo: "token inválido", versao: VERSAO_API });
  }

  // ----------------------------------------------------------
  // 3. Lê o payload
  // ----------------------------------------------------------
  const body    = req.body || {};
  const evento  = String(body.event || "").toUpperCase();
  const payment = body.payment || {};

  // Só processa pagamentos confirmados
  const EVENTOS_PAGAMENTO = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];
  if (!EVENTOS_PAGAMENTO.includes(evento)) {
    return res.status(200).json({ ok: true, motivo: `evento "${evento}" ignorado`, versao: VERSAO_API });
  }

  const asaasId        = String(payment.id                  || "").trim();
  const externalRef    = String(payment.externalReference   || "").trim();
  const invoiceUrl     = String(payment.invoiceUrl          || "").trim();
  const paymentDateRaw = payment.paymentDate || null;
  const valorPago      = calcularValorPago(payment);

  // externalReference deve ser numérico (= Codigo em Contas_Receber)
  if (!externalRef || isNaN(Number(externalRef))) {
    console.warn(`[asaas_webhook] externalReference inválido: "${externalRef}" | asaasId: ${asaasId}`);
    return res.status(200).json({ ok: false, motivo: "externalReference inválido", versao: VERSAO_API });
  }

  const codigoCR = Number(externalRef);

  // Data de pagamento vinda do Asaas (formato ISO: "2025-06-01")
  // Usa meio-dia BRT para evitar virada de dia por conversão UTC
  const dataPagamento = paymentDateRaw
    ? new Date(paymentDateRaw + "T12:00:00-03:00")
    : agoraSaoPaulo();

  let client;

  try {
    client = await pool.connect();

    // --------------------------------------------------------
    // 4. Busca a conta — mesma lógica de critério do VBA:
    //    Codigo = externalRef AND Centro_Custo LIKE centro AND Data_Pagamento IS NULL
    // --------------------------------------------------------
    const rsBusca = await client.query(
      `SELECT
         "Codigo"                                        AS codigo,
         "Código_Cliente"                                AS cod_cliente,
         "Descrição"                                     AS descricao,
         "Valor"                                         AS valor,
         TO_CHAR("Data_Vencimento", 'DD/MM/YYYY')        AS vencimento,
         COALESCE("Portador", '')                        AS portador
       FROM public."Contas_Receber"
      WHERE "Codigo" = $1
        AND "Data_Pagamento" IS NULL
        AND "Centro_Custo"::text LIKE $2`,
      [codigoCR, `%${centro}%`]
    );

    if (rsBusca.rowCount === 0) {
      console.log(`[asaas_webhook] Conta ${codigoCR} não encontrada pendente para centro ${centro} | asaasId: ${asaasId}`);
      return res.status(200).json({ ok: true, motivo: "conta não encontrada ou já baixada", versao: VERSAO_API });
    }

    const conta = rsBusca.rows[0];

    // Idempotência: se Portador já tem este asaasId, foi processado antes
    if (conta.portador && conta.portador.includes(asaasId)) {
      console.log(`[asaas_webhook] Pagamento ${asaasId} já processado — ignorando reenvio`);
      return res.status(200).json({ ok: true, motivo: "já processado", versao: VERSAO_API });
    }

    // --------------------------------------------------------
    // 5. Baixa definitiva — replica exatamente o VBA:
    //    Total, Data_Pagamento, Observações_Pagamento, agendamento_obs, Portador
    // --------------------------------------------------------
    await client.query("BEGIN");

    const obsGravacao = `Asaas_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

    await client.query(
      `UPDATE public."Contas_Receber"
          SET "Total"                   = $1,
              "Data_Pagamento"          = $2,
              "Observações_Pagamento"   = $3,
              "agendamento_obs"         = CASE WHEN $4 <> '' THEN $4 ELSE "agendamento_obs" END,
              "Portador"                = $5
        WHERE "Codigo" = $6`,
      [
        valorPago,
        dataPagamento,
        obsGravacao,
        invoiceUrl,
        asaasId,
        codigoCR
      ]
    );

    await client.query("COMMIT");

    console.log(`[asaas_webhook] ✅ Conta ${codigoCR} baixada | centro ${centro} | R$ ${valorPago.toFixed(2)} | ${asaasId}`);

    // --------------------------------------------------------
    // 6. WPP desativado temporariamente
    // --------------------------------------------------------
    /*
    try {
      const codCliente = conta.cod_cliente;
      if (codCliente) {
        const grupos = await buscarGruposWpp(client, codCliente);
        if (grupos.length > 0) {
          const mensagem = montarMensagemWpp(conta, valorPago, asaasId, centro);
          for (const g of grupos) {
            await client.query(
              `INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
               VALUES ($1, $2, 'pendente')`,
              [g.grupowppid, mensagem]
            );
          }
          console.log(`[asaas_webhook] WPP enfileirado para ${grupos.length} grupo(s) | cliente ${codCliente}`);
        }
      }
    } catch (wppErr) {
      console.error(`[asaas_webhook] Erro ao enfileirar WPP: ${wppErr.message}`);
    }
    */

    return res.status(200).json({
      ok: true,
      codigoCR,
      valorPago,
      versao: VERSAO_API
    });

  } catch (err) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    console.error(`[asaas_webhook] Erro: ${err.message}`);

    // Retorna 200 mesmo em erro interno para evitar loop de retentativas do Asaas
    // O VBA continua funcionando como fallback enquanto o erro não for corrigido
    return res.status(200).json({
      ok: false,
      motivo: "erro interno",
      erro: err.message,
      versao: VERSAO_API
    });

  } finally {
    if (client) client.release();
  }
}
