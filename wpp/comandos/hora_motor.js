// ============================================================
// COMANDO HHH — HORA MOTOR (SAÍDA E RETORNO)
// Allmax Gestão de Cotas — V.2605260110
// Compatível com pg Pool
//
// Comando: hhh / hhhh / HHH / misto (3+ h's)
//
// Fluxo:
//   Pré-validações → Etapa 1 (Hora Motor Saída) → Etapa 2 (Hora Motor Retorno)
// ============================================================

const estadosHoraMotor = new Map()
const VERSAO_HM = 'V.2605271600'

// ============================================================
// HELPERS
// ============================================================

function normalizarTexto(txt) {
  return String(txt || '').trim().toLowerCase()
}

function agoraSaoPauloDate() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  )
}

function hojeIsoSaoPaulo() {
  const d = agoraSaoPauloDate()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function extrairHora(dt) {
  if (!dt) return '—'
  const d = dt instanceof Date ? dt : new Date(dt)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatarDataBR(dt) {
  if (!dt) return '—'
  const d = dt instanceof Date ? dt : new Date(dt)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function horaMotorValida(txt) {
  return /^\d{3},\d$/.test(String(txt || '').trim())
}

function comandoHoraMotor(txt) {
  return /^h{3,}$/i.test(String(txt || '').trim())
}

function chaveEstado(grupoId, remetente) {
  return `hm::${grupoId || ''}::${String(remetente || '').trim().toLowerCase()}`
}

async function enviar(sock, grupoId, texto) {
  await sock.sendMessage(grupoId, { text: texto })
}

function montarCabecalho(pb, grupo, dtAgendamento, nomeEmbar) {
  const hoje = hojeIsoSaoPaulo()
  const [ano, mes, dia] = hoje.split('-')
  const dataFormatada = dtAgendamento
    ? formatarDataBR(dtAgendamento)
    : `${dia}/${mes}/${ano}`
  const cabEmbar = nomeEmbar ? `*${pb}-${grupo}* — ${nomeEmbar}` : `*${pb}-${grupo}*`
  return `📋 ${cabEmbar} — ${dataFormatada}`
}

// ============================================================
// LEITURA ROBUSTA DO Cod_Proprietário
// ============================================================

function lerCodProprietario(row) {
  return Number(
    row['Cod_Proprietário'] ??
    row['Cod_Proprietario'] ??
    row['cod_proprietário'] ??
    row['cod_proprietario'] ??
    0
  )
}

// ============================================================
// QUERIES
// ============================================================

async function buscarGrupoAgenda(pool, grupoId) {
  const rs = await pool.query(`
    SELECT pb, cota, nomegrupowpp, grupowppid
      FROM public.wpp_grupos_agenda
     WHERE grupowppid = $1
     LIMIT 1
  `, [grupoId])
  return rs.rows[0] || null
}

async function buscarAgendamentoHoje(pool, codEmbPb, grupoCompLetra) {
  const hoje = hojeIsoSaoPaulo()

  const rs = await pool.query(`
    SELECT *
      FROM public."P_BOAT_z_10_Saida_Emb"
     WHERE "Cod_Emb_PB" = $1
       AND UPPER(COALESCE("Grupo_Comp_letra", '')) = UPPER($2)
       AND "Dt_Agendamento"::date = $3::date
       AND "Dt_Desistencia"   IS NULL
       AND "Dt_Cancela_saida" IS NULL
     ORDER BY "Dt_Agendamento" ASC
     LIMIT 1
  `, [codEmbPb, grupoCompLetra, hoje])

  return rs.rows[0] || null
}

async function buscarDadosEmbar(pool, pb) {
  try {
    const rs = await pool.query(
      `SELECT "Nome_Embar"
         FROM public."P_BOAT_1_Embarcacao"
        WHERE "Num_PB" = $1
        LIMIT 1`,
      [pb]
    )
    return rs.rows[0] || {}
  } catch (err) {
    console.warn('[buscarDadosEmbar]', err.message)
    return {}
  }
}

async function gravarHoraMotorSaida(pool, id, valor) {
  await pool.query(`
    UPDATE public."P_BOAT_z_10_Saida_Emb"
       SET "Hora_Motor_Saida" = $1
     WHERE "ID" = $2
  `, [valor, id])
}

async function gravarHoraMotorRetorno(pool, id, valor) {
  await pool.query(`
    UPDATE public."P_BOAT_z_10_Saida_Emb"
       SET "Hora_Motor_Retorno" = $1
     WHERE "ID" = $2
  `, [valor, id])
}

// ============================================================
// ETAPAS DO FLUXO
// ============================================================

async function executarEtapa1(sock, pool, grupoId, remetente, agendamento, cabecalho, key) {
  const horaMotorSaida = agendamento['Hora_Motor_Saida']
  const temHoraSaida   = horaMotorSaida !== null && horaMotorSaida !== undefined && horaMotorSaida !== ''

  if (!temHoraSaida) {
    // Solicita hora motor saída
    estadosHoraMotor.set(key, {
      etapa: 'aguardando_hora_motor_saida',
      agendamento,
      cabecalho
    })

    await enviar(sock, grupoId,
      `${cabecalho}\n   Hora motor saída\nInforme a *Hora Motor de Saída*, no formato *000,0*, ou D para desistir\n${VERSAO_HM}`
    )
    return
  }

  // Hora motor saída já preenchida — vai para Etapa 2
  await executarEtapa2(sock, pool, grupoId, remetente, agendamento, cabecalho, key)
}

async function executarEtapa2(sock, pool, grupoId, remetente, agendamento, cabecalho, key) {
  const dtRetorno = agendamento['Dt_Retorno']

  if (!dtRetorno) {
    await enviar(sock, grupoId,
      `${cabecalho}\n\nEmbarcação ainda não retornou. Hora Motor de Retorno não pode ser registrada.\n${VERSAO_HM}`
    )
    return
  }

  const horaMotorRetorno = agendamento['Hora_Motor_Retorno']
  const temHoraRetorno   = horaMotorRetorno !== null && horaMotorRetorno !== undefined && horaMotorRetorno !== ''

  if (temHoraRetorno) {
    await enviar(sock, grupoId,
      `${cabecalho}\n\nHora Motor de Retorno já registrada: *${String(horaMotorRetorno).replace('.', ',')}*\n${VERSAO_HM}`
    )
    return
  }

  // Solicita hora motor retorno
  estadosHoraMotor.set(key, {
    etapa: 'aguardando_hora_motor_retorno',
    agendamento,
    cabecalho
  })

  await enviar(sock, grupoId,
    `${cabecalho}\n   Hora motor retorno\nInforme a *Hora Motor de Retorno*, no formato *000,0*, ou D para desistir\n${VERSAO_HM}`
  )
}

// ============================================================
// TRATAMENTO DE ESTADOS
// ============================================================

async function tratarEstadoHoraMotor(sock, pool, grupoId, remetente, texto) {
  const key    = chaveEstado(grupoId, remetente)
  const estado = estadosHoraMotor.get(key)

  if (!estado) return false

  const msg = normalizarTexto(texto)

  if (msg === 'd') {
    estadosHoraMotor.delete(key)
    await enviar(sock, grupoId, `Desistência registrada.\n${VERSAO_HM}`)
    return true
  }

  // ---- AGUARDANDO HORA MOTOR SAÍDA ----
  if (estado.etapa === 'aguardando_hora_motor_saida') {
    if (!horaMotorValida(texto)) {
      await enviar(sock, grupoId,
        `Informe a Hora Motor de Saída no formato *000,0*, ou D para desistir\n${VERSAO_HM}`
      )
      return true
    }

    estado.horaInformada = String(texto).trim()
    estado.etapa = 'confirmando_hora_motor_saida'
    estadosHoraMotor.set(key, estado)

    await enviar(sock, grupoId,
      `CONFIRMA *${estado.horaInformada}* como Hora Motor de Saída? S/N ou D para desistir/corrigir\n${VERSAO_HM}`
    )
    return true
  }

  // ---- CONFIRMANDO HORA MOTOR SAÍDA ----
  if (estado.etapa === 'confirmando_hora_motor_saida') {
    if (msg === 'n') {
      estado.etapa = 'aguardando_hora_motor_saida'
      estado.horaInformada = ''
      estadosHoraMotor.set(key, estado)
      await enviar(sock, grupoId,
        `Informe a Hora Motor de Saída no formato *000,0*, ou D para desistir\n${VERSAO_HM}`
      )
      return true
    }

    if (msg !== 's') {
      await enviar(sock, grupoId,
        `CONFIRMA *${estado.horaInformada}* como Hora Motor de Saída? S/N ou D para desistir/corrigir\n${VERSAO_HM}`
      )
      return true
    }

    const valor = Number(estado.horaInformada.replace(',', '.'))
    await gravarHoraMotorSaida(pool, estado.agendamento['ID'], valor)

    estado.agendamento['Hora_Motor_Saida'] = valor

    await enviar(sock, grupoId,
      `✅ *Hora Motor de Saída registrada: ${estado.horaInformada}*\n\n` +
      `Emb: ${estado.agendamento['Cod_Emb_PB']} / Grupo: ${estado.agendamento['Grupo_Comp_letra']}\n${VERSAO_HM}`
    )

    // Segue para Etapa 2
    await executarEtapa2(sock, pool, grupoId, remetente, estado.agendamento, estado.cabecalho, key)
    estadosHoraMotor.delete(key)
    return true
  }

  // ---- AGUARDANDO HORA MOTOR RETORNO ----
  if (estado.etapa === 'aguardando_hora_motor_retorno') {
    if (!horaMotorValida(texto)) {
      await enviar(sock, grupoId,
        `Informe a Hora Motor de Retorno no formato *000,0*, ou D para desistir\n${VERSAO_HM}`
      )
      return true
    }

    estado.horaInformada = String(texto).trim()
    estado.etapa = 'confirmando_hora_motor_retorno'
    estadosHoraMotor.set(key, estado)

    await enviar(sock, grupoId,
      `CONFIRMA *${estado.horaInformada}* como Hora Motor de Retorno? S/N ou D para desistir/corrigir\n${VERSAO_HM}`
    )
    return true
  }

  // ---- CONFIRMANDO HORA MOTOR RETORNO ----
  if (estado.etapa === 'confirmando_hora_motor_retorno') {
    if (msg === 'n') {
      estado.etapa = 'aguardando_hora_motor_retorno'
      estado.horaInformada = ''
      estadosHoraMotor.set(key, estado)
      await enviar(sock, grupoId,
        `Informe a Hora Motor de Retorno no formato *000,0*, ou D para desistir\n${VERSAO_HM}`
      )
      return true
    }

    if (msg !== 's') {
      await enviar(sock, grupoId,
        `CONFIRMA *${estado.horaInformada}* como Hora Motor de Retorno? S/N ou D para desistir/corrigir\n${VERSAO_HM}`
      )
      return true
    }

    const valor = Number(estado.horaInformada.replace(',', '.'))
    await gravarHoraMotorRetorno(pool, estado.agendamento['ID'], valor)

    estadosHoraMotor.delete(key)

    await enviar(sock, grupoId,
      `✅ *Hora Motor de Retorno registrada: ${estado.horaInformada}*\n\n` +
      `Emb: ${estado.agendamento['Cod_Emb_PB']} / Grupo: ${estado.agendamento['Grupo_Comp_letra']}\n${VERSAO_HM}`
    )
    return true
  }

  return false
}

// ============================================================
// FLUXO PRINCIPAL
// ============================================================

async function iniciarFluxoHoraMotor(sock, pool, grupoId, remetente, colaborador) {
  const grupoAgenda = await buscarGrupoAgenda(pool, grupoId)

  if (!grupoAgenda) {
    await enviar(sock, grupoId, `Não encontrei este grupo na base de grupos da agenda.\n${VERSAO_HM}`)
    return true
  }

  const codEmbPb       = Number(grupoAgenda.pb)
  const grupoCompLetra = String(grupoAgenda.cota || '').trim().toUpperCase()

  if (!codEmbPb || !grupoCompLetra) {
    await enviar(sock, grupoId, `Não consegui identificar a embarcação/grupo desta conversa.\n${VERSAO_HM}`)
    return true
  }

  // Busca agendamento de hoje
  const agendamento = await buscarAgendamentoHoje(pool, codEmbPb, grupoCompLetra)

  if (!agendamento) {
    await enviar(sock, grupoId, `Não há agendamento ativo para hoje.\n${VERSAO_HM}`)
    return true
  }

  // Verifica Cod_Proprietário
  const codProprietario = lerCodProprietario(agendamento)

  if (codProprietario !== 4255) {
    await enviar(sock, grupoId, `Comando não aplicável a esta embarcação.\n${VERSAO_HM}`)
    return true
  }

  const dadosEmbar  = await buscarDadosEmbar(pool, codEmbPb)
  const nomeEmbar   = dadosEmbar["Nome_Embar"] || ""
  const cabecalho   = montarCabecalho(codEmbPb, grupoCompLetra, agendamento['Dt_Agendamento'], nomeEmbar)
  const key       = chaveEstado(grupoId, remetente)

  await executarEtapa1(sock, pool, grupoId, remetente, agendamento, cabecalho, key)
  return true
}

// ============================================================
// EXPORT PRINCIPAL
// ============================================================

export async function tratarComandoHoraMotor(sock, pool, grupoId, remetente, texto, buscarColaborador) {
  // Primeiro trata estado já aberto
  const estadoTratado = await tratarEstadoHoraMotor(sock, pool, grupoId, remetente, texto)
  if (estadoTratado) return true

  // Verifica se é comando hhh
  if (!comandoHoraMotor(texto)) return false

  // Valida colaborador
  const colaborador = await buscarColaborador(pool, remetente)
  if (!colaborador) {
    await enviar(sock, grupoId, `Comando inválido. Use: colaborador + telefone cadastrado.\n${VERSAO_HM}`)
    return true
  }

  return await iniciarFluxoHoraMotor(sock, pool, grupoId, remetente, colaborador)
}
