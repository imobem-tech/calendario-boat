// ============================================================
// ⚠️ BACKUP: 2610291227_inadimplencia_cliente.js
// Data do backup: 29/10/2026 12:27
// Arquivo original: projetos/calendario_allmax/api/inadimplencia_cliente.js — V.2610290656
// ============================================================
//
// MOTIVO DO BACKUP:
// Correção crítica no filtro de verificação de inadimplência
//
// PROBLEMA RESOLVIDO:
// - O sistema estava ignorando contas vencidas há menos de 3 dias
// - Inconsistência entre agendar.js (correto) e inadimplencia_cliente.js (errado)
// - A lógica de 1-9 dias (notifica) e >9 dias (bloqueia) não funcionava corretamente
//
// FUNÇÕES ALTERADAS:
// - handler() linha 133-141: Removido filtro "CURRENT_DATE - INTERVAL '3 days'"
//   * ANTES: Verificava apenas contas com > 3 dias de atraso
//   * DEPOIS: Verifica QUALQUER conta vencida (< CURRENT_DATE)
//
// SOLUÇÃO:
// - Linha 139: "< CURRENT_DATE - INTERVAL '3 days'" → "< CURRENT_DATE"
// - Agora o portão de verificação é consistente com agendar.js
// - Sistema agora aplica corretamente a regra 1-9 dias vs >9 dias
//
// ============================================================

// ============================================================
// /api/inadimplencia_cliente — V.2610290656
// Allmax Gestão de Cotas — Allmax®2610290656
// Verifica inadimplência do cotista.
// Se inadimplente:
//   1. Envia relatório CR no privado do cliente (Cliente_Telefone_Celular)
//   2. Espelha no grupo ESPELHO_FINANCEIRO (log gerencial)
//
// GET /api/inadimplencia_cliente?codAutorizado=4307&pb=576&grupo=X4&dataAgendamento=2026-10-29
//
// Retorna:
//   { inadimplente: false }
//   { inadimplente: true, privadoEnviado: true|false, espelhoEnviado: true|false, diasAtraso, bloqueado }
// ============================================================

import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®2610290656";

const ESPELHO_FINANCEIRO_ID = process.env.ESPELHO_FINANCEIRO_ID || "120363424805097946@g.us";
const BOT_URL = process.env.BOT_URL || "https://calendario-boat-production.up.railway.app";

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

function montarMensagemCR(faturas, dataAgendamento, diasAtraso, bloqueado) {
  const linhas = [
    "*ALLMAX COTAS*",
    "*SUMMER NÁUTICA*",
    ""
  ];

  // Cabeçalho dinâmico com status do agendamento
  if (dataAgendamento) {
    const status = bloqueado ? "BLOQUEADO" : "liberado";
    linhas.push(`Agendamento para ${dataAgendamento} ${status}`);
    linhas.push("");
    linhas.push(`⚠️ Atraso de ${diasAtraso} dias. Caso ainda não tenha regularizado o débito, faça para garantir a manutenção do agendamento.`);
  } else {
    linhas.push("⚠️ *Informações sobre Contas em Aberto*");
  }

  linhas.push("");

  if (dataAgendamento) {
    linhas.push("⚠️ *Informações sobre Contas em Aberto*");
    linhas.push("");
  }

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
// Envia mensagem via bot
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
  const dispararWpp   = req.query.dispararWpp !== "false";
  const dataAgendamento = String(req.query.dataAgendamento || "").trim();

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
    console.log(`[inadimplencia] totalFaturas=${faturas.length} codAutorizado=${codAutorizado}`);

    // Calcular dias de atraso baseado na conta MAIS ANTIGA
    const rsContaMaisAntiga = await client.query(
      `SELECT "Data_Vencimento"
         FROM public."Contas_Receber"
        WHERE "Código_Cliente" = $1
          AND "Data_Pagamento" IS NULL
          AND "Data_Vencimento" < CURRENT_DATE
        ORDER BY "Data_Vencimento" ASC
        LIMIT 1`,
      [codAutorizado]
    );

    let diasAtraso = 0;
    let dataAgendamentoFormatada = null;

    if (rsContaMaisAntiga.rowCount > 0) {
      const vencimentoMaisAntigo = rsContaMaisAntiga.rows[0].Data_Vencimento;
      const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const dataVencimento = new Date(vencimentoMaisAntigo);

      // Calcular diferença em dias
      const diffTime = hoje.getTime() - dataVencimento.getTime();
      diasAtraso = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    // Formatar data do agendamento se fornecida (YYYY-MM-DD -> DD/MM/YYYY)
    if (dataAgendamento) {
      const [ano, mes, dia] = dataAgendamento.split("-");
      if (ano && mes && dia) {
        dataAgendamentoFormatada = `${dia}/${mes}/${ano}`;
      }
    }

    // Determinar se deve bloquear (> 9 dias)
    const bloqueado = diasAtraso > 9;

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

    let privadoEnviado = false;
    let espelhoEnviado = false;

    if (dispararWpp) {
      const mensagemCR = montarMensagemCR(faturas, dataAgendamentoFormatada, diasAtraso, bloqueado);

      // 1. Privado do cliente
      if (telefoneBruto) {
        const tel = somenteDigitos(telefoneBruto);
        let jid = tel.startsWith("55") ? tel : "55" + tel;
        if (jid.length === 12) jid = jid.slice(0, 4) + "9" + jid.slice(4);
        jid = jid + "@s.whatsapp.net";

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
      let mensagemEspelho =
        `*SAÍDA - ${pb}-${grupo}*\n` +
        `👤 *${nomeCliente}* (Cód. ${codAutorizado})\n` +
        `📱 ${telefoneBruto || "sem telefone"}\n\n`;

      // Adicionar cabeçalho de status se houver data de agendamento
      if (dataAgendamentoFormatada) {
        const status = bloqueado ? "BLOQUEADO" : "liberado";
        mensagemEspelho += `Agendamento para ${dataAgendamentoFormatada} ${status}\n\n`;
        mensagemEspelho += `⚠️ Atraso de ${diasAtraso} dias. Caso ainda não tenha regularizado o débito, faça para garantir a manutenção do agendamento.\n\n`;
      }

      mensagemEspelho += `⚠️ *Informações sobre Contas em Aberto*\n\n`;
      mensagemEspelho += faturas.map(f => {
          const link = String(f.link || "").trim();
          let linhas = [
            `*${f.descricao}*`,
            `  | Valor Original: R$ ${formatarValorBR(f.valor)}`,
            `  | Vencimento: ${f.vencimento}`
          ];
          if (link) { linhas.push(`  | Link:`); linhas.push(`  | ${link}`); }
          return linhas.join("\n");
        }).join("\n\n");

      try {
        await enviarViaBot(ESPELHO_FINANCEIRO_ID, mensagemEspelho);
        espelhoEnviado = true;
        console.log(`[inadimplencia] Espelho enviado`);
      } catch (err) {
        console.warn(`[inadimplencia] Falha espelho:`, err.message);
      }
    }

    const wppEnfileirado = privadoEnviado || espelhoEnviado;

    return res.status(200).json({
      inadimplente: true,
      totalFaturas: faturas.length,
      diasAtraso,
      bloqueado,
      privadoEnviado,
      espelhoEnviado,
      wppEnfileirado,
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
