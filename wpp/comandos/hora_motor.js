// ============================================================
// wpp/comandos/hora_motor.js — V.2605282108
// Allmax Gestão de Cotas — Marujo⚓
// Compatível com pg Pool
//
// Comando: hhh / hhhh / HHH / misto (3+ h's)
//
// Fluxo:
//   Pré-validações → Etapa 1 (Hora Motor Saída) → Etapa 2 (Hora Motor Retorno)
//   → Ao confirmar Retorno: calcula horas usadas × tarifa → gera CR + Asaas
// ============================================================

import { gerarCobrancaCompleta } from '../asaas.js'

const estadosHoraMotor = new Map()
const VERSAO_HM = 'V.2605282108'

const CABECALHO_HM =
`\`\`\`Olá, sou o seu
Assistente Virtual\`\`\` *Marujo⚓*
\`\`\`--------------------------\`\`\``

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

function montarCabecalho(pb, grupo, dtAgendamento) {
  const hoje = hojeIsoSaoPaulo()
  const [ano, mes, dia] = hoje.split('-')
  const dataFormatada = dtAgendamento
    ? formatarDataBR(dtAgendamento)
    : `${dia}/${mes}/${ano}`
  return `📋 Emb ${pb} / Grupo ${grupo} — ${dataFormatada}`
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

async function gravarHoraMotorSaida(pool, id, valor) {
  await pool.query(`
    UPDATE public."P_BOAT_z_10_Saida_Emb"
       SET "Hora_Motor_Saida" = $1
     WHERE "ID" = $2
  `, [valor, id])
}

// ============================================================
// COBRANÇA AUTOMÁTICA HORA MOTOR
// ============================================================

async function gerarCobrancaHoraMotor(sock, pool, grupoId, agendamento) {
  try {
    const codEmb = Number(agendamento['Cod_Emb_PB'] ?? agendamento['Cod_Emb_PB'])
    const hmSaida   = Number(agendamento['Hora_Motor_Saida'])
    const hmRetorno = Number(agendamento['Hora_Motor_Retorno'])

    if (!codEmb || isNaN(hmSaida) || isNaN(hmRetorno)) {
      console.warn('[HM_COBRANÇA] Dados insuficientes para cobrança', { codEmb, hmSaida, hmRetorno })
      return
    }

    const horasUsadas = Math.max(0, hmRetorno - hmSaida)

    if (horasUsadas <= 0) {
      console.warn('[HM_COBRANÇA] Horas usadas <= 0, cobrança não gerada')
      return
    }

    // Busca tarifa vinculada à embarcação
    const rsEmb = await pool.query(`
      SELECT e."Vinculo_Hora_Motor", h."Valor_Hora_Motor", h."Desc_Hora_Moror"
        FROM public."P_BOAT_1_Embarcacao" e
        LEFT JOIN public."Hora_Motor_Valor_Atual" h
          ON h."Cod_Hora_Motor" = e."Vinculo_Hora_Motor"
       WHERE e."Num_PB" = $1
       LIMIT 1
    `, [codEmb])

    const tarifa = rsEmb.rows[0]

    if (!tarifa || !tarifa.Vinculo_Hora_Motor || tarifa.Valor_Hora_Motor <= 0) {
      console.warn('[HM_COBRANÇA] Embarcação sem tarifa configurada, cobrança não gerada')
      await enviar(sock, grupoId,
        `⚠️ Hora Motor registrada, mas embarcação sem tarifa configurada. Cobrança não gerada.`
      )
      return
    }

    const valor = Number((horasUsadas * tarifa.Valor_Hora_Motor).toFixed(2))
    const dtAgendamento = agendamento['Dt_Agendamento']
    const codEmb2 = agendamento['Cod_Emb_PB']
    const grupo   = agendamento['Grupo_Comp_letra']

    const descricao = `Hora_MOTOR ${codEmb2}-${grupo} ` +
      `${new Date(dtAgendamento).toLocaleDateString('pt-BR')} ` +
      `${horasUsadas.toFixed(1)}h`

    // Cod_Autorizado é o cliente da cobrança
    const codCliente = Number(agendamento['Cod_Autorizado'])

    if (!codCliente) {
      console.warn('[HM_COBRANÇA] Cod_Autorizado não encontrado no agendamento')
      return
    }

    const vencimento = new Date()
    vencimento.setDate(vencimento.getDate() + 2)

    const resultado = await gerarCobrancaCompleta(pool, 8, codCliente, {
      valor,
      descricao,
      vencimento,
      centroCusto: '8'
    })

    // Resolve JID do cotista via onWhatsApp para o @menção
    let jidCotista = null
    let mencao = ''
    try {
      const rsCli = await pool.query(`
        SELECT "Cliente_Telefone_Celular"
          FROM public."Cliente"
         WHERE "Codigo" = $1
         LIMIT 1
      `, [codCliente])

      const telRaw = rsCli.rows[0]?.Cliente_Telefone_Celular || ''
      const tel = telRaw.replace(/\D/g, '').replace(/^0/, '')
      const telBr = tel.startsWith('55') ? tel : `55${tel}`

      const [resultado55] = await sock.onWhatsApp(telBr)
      if (resultado55?.exists) {
        jidCotista = resultado55.jid
        mencao = `@${jidCotista.split('@')[0]}`
      }
    } catch (errMencao) {
      console.warn('[HM_COBRANÇA] Não foi possível resolver JID para @:', errMencao.message)
    }

    const textoMsg =
      `${CABECALHO_HM}\n` +
      `*REPASSE_DE_CUSTOS/HORA_MOTOR*\n\n` +
      `Horímetro - *Saída*: ${String(hmSaida).replace('.', ',')}  *Retorno*: ${String(hmRetorno).replace('.', ',')}\n` +
      `*Descrição:*\n` +
      `${descricao}\n\n` +
      `*Valor:* R$ ${valor.toFixed(2).replace('.', ',')}\n` +
      `*Link Boleto/PIX:* ${resultado.linkBoleto}\n\n` +
      `Para pagamento *à vista*!` +
      (mencao ? `\n\n${mencao}` : '')

    const msgOpts = { text: textoMsg }
    if (jidCotista) msgOpts.mentions = [jidCotista]

    await sock.sendMessage(grupoId, msgOpts)

    console.log('[HM_COBRANÇA] Cobrança gerada', resultado)

  } catch (err) {
    console.error('[HM_COBRANÇA] Erro ao gerar cobrança:', err.message)
    await enviar(sock, grupoId,
      `⚠️ Hora Motor registrada. Erro ao gerar cobrança automática: ${err.message}`
    )
  }
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

    // Atualiza o agendamento em memória com o retorno gravado
    estado.agendamento['Hora_Motor_Retorno'] = valor

    estadosHoraMotor.delete(key)

    await enviar(sock, grupoId,
      `✅ *Hora Motor de Retorno registrada: ${estado.horaInformada}*\n\n` +
      `Emb: ${estado.agendamento['Cod_Emb_PB']} / Grupo: ${estado.agendamento['Grupo_Comp_letra']}\n${VERSAO_HM}`
    )

    // Gera cobrança automática
    await gerarCobrancaHoraMotor(sock, pool, grupoId, estado.agendamento)

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

  const cabecalho = montarCabecalho(codEmbPb, grupoCompLetra, agendamento['Dt_Agendamento'])
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
