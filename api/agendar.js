import pkg from "pg";
const { Pool } = pkg;

const VERSAO_API = "Allmax®2604240040";
const VERSAO_WPP = process.env.VERSAO_WPP || "Allmax®2604232353";

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
    "domingo","segunda-feira","terça-feira",
    "quarta-feira","quinta-feira","sexta-feira","sábado"
  ];

  const [ano, mes, dia] = String(dataIso).split("-").map(Number);
  const dt = new Date(ano, mes - 1, dia);

  return dias[dt.getDay()];
}

// ✅ CORRIGIDO AQUI
async function buscarGrupoWppAgenda(client, pb, cota) {
  const rsCota = await client.query(
    `SELECT GrupoWppId, NomeGrupoWpp
       FROM public.wpp_grupos_agenda
      WHERE PB = $1
        AND UPPER(COALESCE(Cota, '')) = UPPER($2)
      LIMIT 1`,
    [pb, cota || ""]
  );

  if (rsCota.rowCount > 0) {
    return rsCota.rows[0];
  }

  const rsGeral = await client.query(
    `SELECT GrupoWppId, NomeGrupoWpp
       FROM public.wpp_grupos_agenda
      WHERE PB = $1
        AND Cota IS NULL
      LIMIT 1`,
    [pb]
  );

  if (rsGeral.rowCount > 0) {
    return rsGeral.rows[0];
  }

  return null;
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
    return res.status(405).json({ error: "Método não permitido", versao: VERSAO_API });
  }

  let client;

  try {
    const { token, data, hora } = req.body || {};

    if (!token || !data || !hora) {
      return res.status(400).json({ error: "Dados incompletos", versao: VERSAO_API });
    }

    const acesso = decodeToken(token);
    if (!acesso) {
      return res.status(400).json({ error: "Token inválido", versao: VERSAO_API });
    }

    const codEmbPB = Number(acesso.pb);
    const codAutorizado = Number(acesso.codAutorizado);
    const grupo = acesso.grupo;
    const limiteGrupo = extrairLimiteDoGrupo(grupo);

    if (!codEmbPB || !codAutorizado || !grupo || !limiteGrupo) {
      return res.status(400).json({ error: "Dados do token inválidos.", versao: VERSAO_API });
    }

    const horaNormalizada = normalizarHora(hora);
    if (!horaNormalizada) {
      return res.status(400).json({ error: "Hora inválida.", versao: VERSAO_API });
    }

    const contingenciaHoje = ehDiaContingenciaHoje(data);
    const dataHoraAgendamento = `${data} ${horaNormalizada}`;

    client = await pool.connect();
    await client.query("BEGIN");

    await client.query(`LOCK TABLE public."P_BOAT_z_10_Saida_Emb" IN EXCLUSIVE MODE`);

    // (resto igual...)

    await client.query("COMMIT");

    const mensagemWpp = `🚤 NOVO AGENDAMENTO
PB: ${codEmbPB}
Grupo: ${grupo}
Autorizado: ${codAutorizado}
Data: ${formatarDataPtBr(data)} - ${obterDiaSemanaPtBr(data)}
Hora: ${horaNormalizada.slice(0,5)}
Código: ${proximoCodigo}

${VERSAO_WPP}`;

    try {
      const grupoWpp = await buscarGrupoWppAgenda(client, codEmbPB, grupo);

      if (!grupoWpp?.grupowppid) {
        console.error(`Grupo não encontrado PB ${codEmbPB} / ${grupo}`);
      } else {
        await client.query(
          `INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
           VALUES ($1, $2, 'pendente')`,
          [grupoWpp.grupowppid, mensagemWpp]
        );
      }
    } catch (e) {
      console.error("Erro fila:", e.message);
    }

    return res.status(200).json({
      msg: `Agendado com sucesso`,
      versao: VERSAO_API
    });

  } catch (err) {
    if (client) await client.query("ROLLBACK");
    return res.status(500).json({ error: err.message, versao: VERSAO_API });
  } finally {
    if (client) client.release();
  }
}
