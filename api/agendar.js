// ============================================================
// /api/agendar — V.2606041250
// Allmax Gestão de Cotas — Marujo⚓
// FIX: Cod_Proprietário agora busca do autorizado ativo, não mais fixo 4255
// ============================================================
import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®2606041250";
const VERSAO_WPP = process.env.VERSAO_WPP || "Allmax®2604232353";

const CABECALHO_MARUJO =
`\`\`\`Olá, sou o seu
Assistente Virtual\`\`\` *Marujo⚓*
\`\`\`--------------------------\`\`\``

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
  // Inclui MMDD do dia atual na soma para validação
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mm = String(agora.getMonth() + 1).padStart(2, "0");
  const dd = String(agora.getDate()).padStart(2, "0");
  const mmdd = `${mm}${dd}`;
  const base = `${pb}${grupoNum}${autorizado}${mmdd}`;
  const soma = base.split("").reduce((acc, n) => acc + Number(n), 0);
  return String(soma).padStart(2, "0");
}

function decodeToken(token) {
  const t = String(token || "").trim().toLowerCase();

  // Novo formato com MMDD: [pb][letra][grupoNum][autorizado4][mmdd4][dv2]

   
      const m = t.match(/^([a-j]+)([a-z0-9])([a-j]+)([a-j]{4})([a-j]{4})([a-j]{2})$/);

  if (!m) return null;

  const pb = decodificar(m[1]);
  const grupoLetra = m[2].toUpperCase();
  const grupoNum = decodificar(m[3]);
  const autorizado = decodificar(m[4]);
  const mmdd = decodificar(m[5]).padStart(4, "0");
  const dv = decodificar(m[6]);

  if (!pb || !grupoNum || !autorizado || !dv) return null;

  // Valida MMDD: token deve ser do dia atual (horário Brasil)
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mmHoje = String(agora.getMonth() + 1).padStart(2, "0");
  const ddHoje = String(agora.getDate()).padStart(2, "0");
  const mmddHoje = `${mmHoje}${ddHoje}`;

  if (mmdd !== mmddHoje) return null; // token expirado

  const dvCalc = calcularDV(pb, grupoNum, autorizado);
  if (dv !== dvCalc) return null;

 const primeiroGrupo = decodificar(m[2]);
const grupoFinal = primeiroGrupo ? `${primeiroGrupo}${grupoNum}` : `${grupoLetra}${grupoNum}`;

return {
  pb,
  grupo: grupoFinal,
  codAutorizado: autorizado,
  token: t
};
}

function extrairLimiteDoGrupo(grupo) {
  const m = String(grupo || "").match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function normalizarHora(hora) {
  const h = String(hora || "").trim();

  if (/^\d{2}:\d{2}$/.test(h)) return `${h}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(h)) return h;

  return null;
}

function formatarDataPtBr(dataIso) {
  const [ano, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}/${ano}`;
}

function obterDiaSemanaPtBr(dataIso) {
  const dias = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado"
  ];

  const [ano, mes, dia] = String(dataIso).split("-").map(Number);
  const dt = new Date(ano, mes - 1, dia);

  return dias[dt.getDay()];
}

async function buscarGruposWppAgenda(client, pb, cota) {
  const rsCota = await client.query(
    `SELECT grupowppid, nomegrupowpp
       FROM public.wpp_grupos_agenda
      WHERE pb = $1
        AND UPPER(COALESCE(cota, '')) = UPPER($2)
      ORDER BY nomegrupowpp`,
    [pb, cota || ""]
  );

  if (rsCota.rowCount > 0) {
    return rsCota.rows;
  }

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
function montarMensagemLimite(limiteGrupo, rows) {
  const linhas = [`Limite do grupo (${limiteGrupo}) atingido.`];

  for (const row of rows || []) {
    if (row?.data_agendada) {
      linhas.push(formatarDataPtBr(row.data_agendada));
    }
  }

  linhas.push(VERSAO_API);
  return linhas.join("\n");
}

function ehDiaContingenciaHoje(dataIso) {
  const hoje = new Date();
  const [ano, mes, dia] = String(dataIso).split("-").map(Number);

  const dataInformada = new Date(ano, mes - 1, dia);

  const mesmaData =
    dataInformada.getFullYear() === hoje.getFullYear() &&
    dataInformada.getMonth() === hoje.getMonth() &&
    dataInformada.getDate() === hoje.getDate();

  if (!mesmaData) return false;

  const diaSemana = hoje.getDay();
  return diaSemana >= 2 && diaSemana <= 4;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido",
      versao: VERSAO_API
    });
  }

  let client;

  try {
    const { token, data, hora } = req.body || {};

    if (!token || !data || !hora) {
      return res.status(400).json({
        error: "Dados incompletos",
        versao: VERSAO_API
      });
    }

    const acesso = decodeToken(token);

    if (!acesso) {
      return res.status(400).json({
        error: "Token inválido",
        versao: VERSAO_API
      });
    }

    const codEmbPB = Number(acesso.pb);
    const codAutorizado = Number(acesso.codAutorizado);
    const grupo = acesso.grupo;
    const limiteGrupo = extrairLimiteDoGrupo(grupo);

    if (!codEmbPB || !codAutorizado || !grupo || !limiteGrupo) {
      return res.status(400).json({
        error: "Dados do token inválidos.",
        versao: VERSAO_API
      });
    }

    const horaNormalizada = normalizarHora(hora);

    if (!horaNormalizada) {
      return res.status(400).json({
        error: "Hora inválida. Use HH:MM ou HH:MM:SS.",
        versao: VERSAO_API
      });
    }

    const contingenciaHoje = ehDiaContingenciaHoje(data);
    const dataHoraAgendamento = `${data} ${horaNormalizada}`;

    client = await pool.connect();

    const rsInadim = await client.query(
      `SELECT EXISTS (
         SELECT 1
           FROM public."Contas_Receber"
          WHERE "Código_Cliente" = $1
            AND "Data_Pagamento" IS NULL
            AND "Data_Vencimento" < CURRENT_DATE - INTERVAL '3 days'
       ) AS inadimplente`,
      [codAutorizado]
    );

    if (rsInadim.rows[0]?.inadimplente === true) {
      return res.status(403).json({
        error: "Agendamento suspenso. Faça contato com a Marina através do WhatsApp.",
        versao: VERSAO_API
      });
    }

    await client.query("BEGIN");

    await client.query(`LOCK TABLE public."P_BOAT_z_10_Saida_Emb" IN EXCLUSIVE MODE`);

    const conflitoDia = await client.query(
      `SELECT 1
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND "Dt_Agendamento"::date = $2::date
          AND "Dt_Desistencia" IS NULL
          AND "Dt_Cancela_saida" IS NULL
        LIMIT 1`,
      [codEmbPB, data]
    );

    if (conflitoDia.rowCount > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: `Embarcação ${codEmbPB} já possui agenda para o dia!`,
        versao: VERSAO_API
      });
    }

    if (!contingenciaHoje) {
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
        const datasFuturas = await client.query(
          `SELECT DISTINCT TO_CHAR("Dt_Agendamento"::date, 'YYYY-MM-DD') AS data_agendada
             FROM public."P_BOAT_z_10_Saida_Emb"
            WHERE "Cod_Emb_PB" = $1
              AND "Cod_Autorizado" = $2
              AND "Grupo_Comp_letra" = $3
              AND "Dt_Agendamento"::date >= CURRENT_DATE
              AND "Dt_Desistencia" IS NULL
              AND "Dt_Cancela_saida" IS NULL
            ORDER BY data_agendada`,
          [codEmbPB, codAutorizado, grupo]
        );

        await client.query("ROLLBACK");

        return res.status(409).json({
          error: montarMensagemLimite(limiteGrupo, datasFuturas.rows),
          versao: VERSAO_API
        });
      }
    }

    const rsCodigo = await client.query(
      `SELECT COALESCE(MAX("Código"), 0) + 1 AS proximo_codigo
         FROM public."P_BOAT_z_10_Saida_Emb"`
    );

    const proximoCodigo = rsCodigo.rows[0].proximo_codigo;

    // ============================================================
    // BUSCAR PROPRIETÁRIO CORRETO (cod_autorizado = Cod_Pessoa da tabela P_BOAT_4_Autorizados)
    // ============================================================
    const rsProprietario = await client.query(
      `SELECT "Cod_Pessoa"
         FROM public."P_BOAT_4_Autorizados"
        WHERE "Cod_Embarcacao" = $1
          AND "Cod_Pessoa" = $2
          AND "Dt_Desautorizacao" IS NULL
          AND "Dt_Cancelamento" IS NULL
        LIMIT 1`,
      [codEmbPB, codAutorizado]
    );

    // Se encontrou o autorizado ativo, usa ele como proprietário
    // Senão, usa 4255 (Allmax) como fallback
    const codProprietario = rsProprietario.rows.length > 0
      ? rsProprietario.rows[0].Cod_Pessoa
      : 4255;

    await client.query(
      `INSERT INTO public."P_BOAT_z_10_Saida_Emb"
       (
         "Código",
         "Cod_Emb_PB",
         "Cod_Proprietário",
         "Cod_Autorizado",
         "Dt_Solicitacao",
         "Dt_Agendamento",
         "Grupo_Comp_letra",
         "updated_at"
       )
       VALUES
       (
         $1,
         $2,
         $3,
         $4,
         (NOW() AT TIME ZONE 'America/Sao_Paulo'),
         $5::timestamp,
         $6,
         (NOW() AT TIME ZONE 'America/Sao_Paulo')
       )`,
      [
        proximoCodigo,
        codEmbPB,
        codProprietario,  // ← CORRIGIDO: agora usa o proprietário correto
        codAutorizado,
        dataHoraAgendamento,
        grupo
      ]
    );

    await client.query("COMMIT");

    const dataFormatada = formatarDataPtBr(data);
    const diaSemana = obterDiaSemanaPtBr(data);
    const horaExibicao = horaNormalizada.slice(0, 5);

    const prefixo = contingenciaHoje
      ? "Agendamento de contingência"
      : "Agendamento com sucesso";

    const mensagemWpp =
`${CABECALHO_MARUJO}
🚤 NOVO AGENDAMENTO
PB: ${codEmbPB}
Grupo: ${grupo}
Autorizado: ${codAutorizado}
Data: ${dataFormatada} - ${diaSemana}
Hora: ${horaExibicao}
Código: ${proximoCodigo}

${VERSAO_WPP}`;

   try {
  const gruposWpp = await buscarGruposWppAgenda(client, codEmbPB, grupo);

  if (!gruposWpp.length) {
    console.error(`Nenhum grupo WhatsApp encontrado para PB ${codEmbPB} / Cota ${grupo}`);
  } else {
    for (const grupoWpp of gruposWpp) {
      await client.query(
        `INSERT INTO public.wpp_fila_agenda
         (grupo_id, mensagem, status)
         VALUES ($1, $2, 'pendente')`,
        [grupoWpp.grupowppid, mensagemWpp]
      );

      console.log(`Mensagem enfileirada para ${grupoWpp.nomegrupowpp}`);
    }
  }
} catch (filaErr) {
  console.error("Erro ao gravar fila WhatsApp:", filaErr.message);
}

    return res.status(200).json({
      msg: `${prefixo} ${dataFormatada} ${diaSemana} às ${horaExibicao}\n${VERSAO_API}`,
      versao: VERSAO_API
    });

  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    return res.status(500).json({
      error: err.message || "Erro interno",
      versao: VERSAO_API
    });

  } finally {
    if (client) client.release();
  }
}
