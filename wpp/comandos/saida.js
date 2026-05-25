// ============================================================
// COMANDO SSS — REGISTRO DE SAÍDA
// Allmax Gestão de Cotas
// ============================================================

const estadosSaida = new Map();

// ============================================================
// HELPERS
// ============================================================

function somenteDigitos(txt) {
  return String(txt || "").replace(/\D+/g, "");
}

function normalizarTexto(txt) {
  return String(txt || "").trim().toLowerCase();
}

function agoraSaoPauloDate() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Sao_Paulo"
    })
  );
}

function hojeIsoSaoPaulo() {
  const d = agoraSaoPauloDate();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function formatarDataHoraBR(dt = agoraSaoPauloDate()) {

  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();

  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function chaveEstado(numeroRemetente, grupo) {
  return `${somenteDigitos(numeroRemetente)}::${grupo || ""}`;
}

function horaMotorValida(txt) {
  return /^\d{3},\d$/.test(
    String(txt || "").trim()
  );
}

// ============================================================
// TELEFONES
// ============================================================

function variantesTelefoneBR(numeroOriginal) {

  const bruto = somenteDigitos(numeroOriginal);

  const variantes = new Set();

  function add(n) {
    if (n) variantes.add(String(n));
  }

  add(bruto);

  // --------------------------------------------------
  // remove DDI 55
  // --------------------------------------------------

  let sem55 = bruto;

  if (sem55.startsWith("55") && sem55.length >= 12) {
    sem55 = sem55.slice(2);
    add(sem55);
  }

  // --------------------------------------------------
  // COM 9
  // 63984030406
  // --------------------------------------------------

  if (sem55.length === 11) {

    const ddd = sem55.slice(0, 2);
    const numero = sem55.slice(2);

    add(sem55);
    add("55" + sem55);

    // gera versão SEM 9
    // 6384030406

    if (numero.startsWith("9")) {

      const semNove = ddd + numero.slice(1);

      add(semNove);
      add("55" + semNove);
    }
  }

  // --------------------------------------------------
  // SEM 9
  // 6384030406
  // --------------------------------------------------

  if (sem55.length === 10) {

    const ddd = sem55.slice(0, 2);
    const numero = sem55.slice(2);

    add(sem55);
    add("55" + sem55);

    // gera versão COM 9
    // 63984030406

    const comNove = ddd + "9" + numero;

    add(comNove);
    add("55" + comNove);
  }

  return Array.from(variantes);
}

// ============================================================
// COLABORADOR
// ============================================================

async function buscarColaborador({
  supabase,
  numeroRemetente
}) {

  const variantesRemetente =
    variantesTelefoneBR(numeroRemetente);

  const { data, error } = await supabase
    .from("wpp_colaboradores")
    .select("ID, Nome, Telefone, Administrador");

  if (error) {
    throw error;
  }

  for (const colab of (data || [])) {

    const variantesColab =
      variantesTelefoneBR(colab.Telefone);

    const encontrou =
      variantesColab.some(v =>
        variantesRemetente.includes(v)
      );

    if (encontrou) {
      return colab;
    }
  }

  return null;
}

// ============================================================
// BUSCA SAÍDA
// ============================================================

async function buscarSaidaDoDia({
  supabase,
  codEmbPb,
  grupoCompLetra
}) {

  const hoje = hojeIsoSaoPaulo();

  const { data, error } = await supabase
    .from("P_BOAT_z_10_Saida_Emb")
    .select("*")
    .eq("Cod_Emb_PB", codEmbPb)
    .eq("Grupo_Comp_letra", grupoCompLetra)
    .gte("Dt_Agendamento", `${hoje} 00:00:00`)
    .lte("Dt_Agendamento", `${hoje} 23:59:59`);

  if (error) {
    throw error;
  }

  return (data || []);
}

// ============================================================
// REGISTRA HORA MOTOR
// ============================================================

async function registrarHoraMotor({
  supabase,
  idSaida,
  horaMotor
}) {

  const valor =
    Number(
      String(horaMotor)
        .replace(",", ".")
    );

  const { error } = await supabase
    .from("P_BOAT_z_10_Saida_Emb")
    .update({
      Hora_Motor_Saida: valor
    })
    .eq("ID", idSaida);

  if (error) {
    throw error;
  }
}

// ============================================================
// REGISTRA SAÍDA
// ============================================================

async function registrarSaida({
  supabase,
  saida,
  colaborador
}) {

  const agora = agoraSaoPauloDate();

  const agoraIso = agora.toISOString();

  const agoraBR =
    formatarDataHoraBR(agora);

  // --------------------------------------------------

  const { error: erroSaida } =
    await supabase
      .from("P_BOAT_z_10_Saida_Emb")
      .update({
        "Dt_Saída": agoraIso,
        Dt_Desistencia: null,
        Colab_Responsavel: colaborador.Nome
      })
      .eq("ID", saida.ID);

  if (erroSaida) {
    throw erroSaida;
  }

  // --------------------------------------------------

  const { error: erroOs } =
    await supabase
      .from("P_BOAT_9_OS")
      .update({
        OS_obs_Fechamento:
          `Decida ou cancelamento em_${agoraBR}  `
      })
      .is("OS_Dt_Fechamento", null)
      .eq("Num_Emb_PB", saida.Cod_Emb_PB)
      .eq("Tipo", "SAÍDA");

  if (erroOs) {
    throw erroOs;
  }

  return agoraBR;
}

// ============================================================
// INICIAR FLUXO
// ============================================================

async function iniciarFluxoSaida({

  supabase,
  enviarMensagem,
  numeroRemetente,
  grupo,
  codEmbPb,
  grupoCompLetra

}) {

  // --------------------------------------------------
  // COLABORADOR
  // --------------------------------------------------

  const colaborador =
    await buscarColaborador({
      supabase,
      numeroRemetente
    });

  if (!colaborador) {

    await enviarMensagem(
      "Comando não autorizado para este usuário."
    );

    return true;
  }

  // --------------------------------------------------
  // BUSCA SAÍDA
  // --------------------------------------------------

  const saidas =
    await buscarSaidaDoDia({
      supabase,
      codEmbPb,
      grupoCompLetra
    });

  // --------------------------------------------------

  if (!saidas.length) {

    await enviarMensagem(
      "Não encontrei agendamento de saída para esta embarcação/grupo hoje."
    );

    return true;
  }

  // --------------------------------------------------

  if (saidas.length > 1) {

    await enviarMensagem(
      "Encontrei mais de uma saída para hoje. Não consegui registrar automaticamente."
    );

    return true;
  }

  // --------------------------------------------------

  const saida = saidas[0];

  // --------------------------------------------------
  // DESISTÊNCIA
  // --------------------------------------------------

  if (saida.Dt_Desistencia) {

    await enviarMensagem(
      "Esta saída consta como desistência."
    );

    return true;
  }

  // --------------------------------------------------
  // CANCELAMENTO
  // --------------------------------------------------

  if (saida.Dt_Cancela_saida) {

    await enviarMensagem(
      "Esta saída consta como cancelada."
    );

    return true;
  }

  // --------------------------------------------------
  // JÁ SAIU
  // --------------------------------------------------

  if (saida["Dt_Saída"]) {

    await enviarMensagem(
      "Esta embarcação já teve a saída registrada hoje."
    );

    return true;
  }

  // --------------------------------------------------
  // ESTADO
  // --------------------------------------------------

  const key =
    chaveEstado(
      numeroRemetente,
      grupo
    );

  // --------------------------------------------------
  // PRECISA HORA MOTOR?
  // --------------------------------------------------

  const precisaHoraMotor =

    Number(saida["Cod_Proprietário"]) === 4255 &&

    (
      saida.Hora_Motor_Saida === null ||
      saida.Hora_Motor_Saida === undefined ||
      saida.Hora_Motor_Saida === ""
    );

  // --------------------------------------------------

  if (precisaHoraMotor) {

    estadosSaida.set(key, {

      etapa:
        "aguardando_hora_motor_saida",

      saida,
      colaborador,
      codEmbPb,
      grupoCompLetra

    });

    await enviarMensagem(
      "Informe a Hora Motor de Saída, no formato 000,0, ou D para desistir"
    );

    return true;
  }

  // --------------------------------------------------
  // CONFIRMAÇÃO DIRETA
  // --------------------------------------------------

  estadosSaida.set(key, {

    etapa:
      "aguardando_confirmacao_saida",

    saida,
    colaborador,
    codEmbPb,
    grupoCompLetra

  });

  await enviarMensagem(
    "Confirma saída? S/N"
  );

  return true;
}

// ============================================================
// TRATAR ESTADO
// ============================================================

async function tratarEstadoSaida({

  supabase,
  enviarMensagem,
  numeroRemetente,
  grupo,
  texto

}) {

  const key =
    chaveEstado(
      numeroRemetente,
      grupo
    );

  const estado =
    estadosSaida.get(key);

  if (!estado) {
    return false;
  }

  const msg =
    normalizarTexto(texto);

  // --------------------------------------------------
  // DESISTÊNCIA GLOBAL
  // --------------------------------------------------

  if (msg === "d") {

    estadosSaida.delete(key);

    await enviarMensagem(
      "Desistência registrada."
    );

    return true;
  }

  // ==================================================
  // AGUARDANDO HORA MOTOR
  // ==================================================

  if (
    estado.etapa ===
    "aguardando_hora_motor_saida"
  ) {

    if (!horaMotorValida(texto)) {

      await enviarMensagem(
        "Informe a Hora Motor de Saída, no formato 000,0, ou D para desistir"
      );

      return true;
    }

    estado.horaMotorInformada =
      String(texto).trim();

    estado.etapa =
      "aguardando_confirmacao_hora_motor";

    estadosSaida.set(key, estado);

    await enviarMensagem(
      `CONFIRMA ${estado.horaMotorInformada}? S/N ou D para desistir/corrigir`
    );

    return true;
  }

  // ==================================================
  // CONFIRMAÇÃO HORA MOTOR
  // ==================================================

  if (
    estado.etapa ===
    "aguardando_confirmacao_hora_motor"
  ) {

    // ----------------------------------------------

    if (msg === "n") {

      estado.etapa =
        "aguardando_hora_motor_saida";

      estado.horaMotorInformada = "";

      estadosSaida.set(key, estado);

      await enviarMensagem(
        "Informe a Hora Motor de Saída, no formato 000,0, ou D para desistir"
      );

      return true;
    }

    // ----------------------------------------------

    if (msg !== "s") {

      await enviarMensagem(
        `CONFIRMA ${estado.horaMotorInformada}? S/N ou D para desistir/corrigir`
      );

      return true;
    }

    // ----------------------------------------------

    await registrarHoraMotor({

      supabase,

      idSaida:
        estado.saida.ID,

      horaMotor:
        estado.horaMotorInformada

    });

    estado.saida.Hora_Motor_Saida =
      Number(
        estado.horaMotorInformada
          .replace(",", ".")
      );

    estado.etapa =
      "aguardando_confirmacao_saida";

    estadosSaida.set(key, estado);

    await enviarMensagem(
      "Confirma saída? S/N"
    );

    return true;
  }

  // ==================================================
  // CONFIRMAÇÃO FINAL
  // ==================================================

  if (
    estado.etapa ===
    "aguardando_confirmacao_saida"
  ) {

    // ----------------------------------------------

    if (msg === "n") {

      estadosSaida.delete(key);

      await enviarMensagem(
        "Saída não confirmada."
      );

      return true;
    }

    // ----------------------------------------------

    if (msg !== "s") {

      await enviarMensagem(
        "Confirma saída? S/N"
      );

      return true;
    }

    // ----------------------------------------------

    const dataHoraBR =
      await registrarSaida({

        supabase,
        saida: estado.saida,
        colaborador: estado.colaborador

      });

    estadosSaida.delete(key);

    // ----------------------------------------------

    let resposta =

      `Saída registrada com sucesso.\n\n` +

      `Embarcação: ${estado.saida.Cod_Emb_PB}\n` +

      `Grupo: ${estado.saida.Grupo_Comp_letra}\n` +

      `Colaborador: ${estado.colaborador.Nome}\n` +

      `Data/Hora: ${dataHoraBR}`;

    // ----------------------------------------------

    if (

      estado.saida.Hora_Motor_Saida !== null &&
      estado.saida.Hora_Motor_Saida !== undefined

    ) {

      resposta +=
        `\nHora Motor Saída: ${
          String(
            estado.saida.Hora_Motor_Saida
          ).replace(".", ",")
        }`;
    }

    // ----------------------------------------------

    await enviarMensagem(resposta);

    return true;
  }

  return false;
}

// ============================================================
// EXPORT
// ============================================================

export async function tratarComandoSaida({

  texto,
  numeroRemetente,
  nomeRemetente,
  grupo,
  supabase,
  enviarMensagem,
  codEmbPb,
  grupoCompLetra

}) {

  // --------------------------------------------------
  // ESTADO
  // --------------------------------------------------

  const estadoTratado =
    await tratarEstadoSaida({

      supabase,
      enviarMensagem,
      numeroRemetente,
      grupo,
      texto

    });

  if (estadoTratado) {
    return true;
  }

  // --------------------------------------------------
  // COMANDO
  // --------------------------------------------------

  const msg =
    normalizarTexto(texto);

  if (!/^s{3,}$/i.test(msg)) {
    return false;
  }

  // --------------------------------------------------
  // INICIAR
  // --------------------------------------------------

  return await iniciarFluxoSaida({

    supabase,
    enviarMensagem,
    numeroRemetente,
    grupo,
    codEmbPb,
    grupoCompLetra

  });
}
