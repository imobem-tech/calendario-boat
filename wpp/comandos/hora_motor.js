// ============================================================
// wpp/comandos/hora_motor.js — V.2605282316
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
import { alertarAdm } from './admin.js'

const GRUPO_ADM = '556332258473-1556910161@g.us'

const estadosHoraMotor = new Map()
const VERSAO_HM = 'V.2605282316'

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

// ============================================================
// BUSCA ÚLTIMO HM RETORNO VÁLIDO DA EMBARCAÇÃO
// ============================================================

async function buscarUltimoHMRetorno(pool, codEmb) {
  const { rows } = await pool.query(`
    SELECT "Hora_Motor_Retorno", "ID"
      FROM public."P_BOAT_z_10_Saida_Emb"
     WHERE "Cod_Emb_PB" = $1
       AND "Dt_Desistencia"    IS NULL
       AND "Dt_Cancela_saida"  IS NULL
       AND "Hora_Motor_Retorno" IS NOT NULL
     ORDER BY "Dt_Agendamento" DESC
     LIMIT 1
  `, [codEmb])
  return rows[0] || null
}

async function buscarMediaHMHistorica(pool, codEmb) {
  const { rows } = await pool.query(`
    SELECT AVG("Hora_Motor_Retorno" - "Hora_Motor_Saida") AS media
      FROM public."P_BOAT_z_10_Saida_Emb"
     WHERE "Cod_Emb_PB" = $1
       AND "Dt_Desistencia"    IS NULL
       AND "Dt_Cancela_saida"  IS NULL
       AND "Hora_Motor_Saida"  IS NOT NULL
       AND "Hora_Motor_Retorno" IS NOT NULL
     ORDER BY "Dt_Agendamento" DESC
     LIMIT 10
  `, [codEmb])
  return rows[0]?.media ? Number(rows[0].media) : null
}

async function contarRetornosAusentes(pool, codEmb) {
  const { rows } = await pool.query(`
    SELECT COUNT(*) AS qtd
      FROM public."P_BOAT_z_10_Saida_Emb"
     WHERE "Cod_Emb_PB" = $1
       AND "Dt_Desistencia"    IS NULL
       AND "Dt_Cancela_saida"  IS NULL
       AND "Hora_Motor_Saida"  IS NOT NULL
       AND "Hora_Motor_Retorno" IS NULL
       AND "Dt_Agendamento" >= NOW() - INTERVAL '30 days'
  `, [codEmb])
  return Number(rows[0]?.qtd || 0)
}

function cabecalhoAlerta(idSaida, codEmb, grupo, dtAgendamento, colaborador) {
  return `Emb: ${codEmb} / Grupo: ${grupo} — ${new Date(dtAgendamento).toLocaleDateString('pt-BR')}\n` +
         `ID Saída: ${idSaida}\nColaborador: ${colaborador}`
}

// ============================================================
// CRÍTICAS DE HM SAÍDA
// ============================================================

async function criticarHMSaida(sock, pool, idSaida, codEmb, grupo, dtAgendamento, colaborador, hmSaida) {
  const ultimo = await buscarUltimoHMRetorno(pool, codEmb)

  if (ultimo) {
    const hmAnterior = Number(ultimo.Hora_Motor_Retorno)
    const diff = Number((hmSaida - hmAnterior).toFixed(1))

    // CRÍTICO 1 — fora do intervalo esperado
    if (diff < 0 || diff > 0.1) {
      const cab = cabecalhoAlerta(idSaida, codEmb, grupo, dtAgendamento, colaborador)
      await alertarAdm(sock,
        `🔴 *HM SAÍDA BLOQUEADA*\n${cab}\n` +
        `Valor informado: ${String(hmSaida).replace('.', ',')}\n` +
        `Último HM retorno válido: ${String(hmAnterior).replace('.', ',')}\n` +
        `Diferença: ${diff > 0 ? '+' : ''}${diff}\n` +
        `Esperado: entre ${hmAnterior} e ${Number((hmAnterior + 0.1).toFixed(1))}\n` +
        `Ação: registro bloqueado.\n\nPara corrigir: *corrigir_${idSaida}_S*`
      )
      return { bloqueado: true, motivo: 'HM_SAIDA_FORA_INTERVALO' }
    }
  }

  return { bloqueado: false }
}

// ============================================================
// CRÍTICAS DE HM RETORNO
// ============================================================

async function criticarHMRetorno(sock, pool, idSaida, codEmb, grupo, dtAgendamento, dtSaida, dtRetorno, colaborador, hmSaida, hmRetorno) {
  const cab = cabecalhoAlerta(idSaida, codEmb, grupo, dtAgendamento, colaborador)
  const hmUsado = Number((hmRetorno - hmSaida).toFixed(1))

  // CRÍTICO 2 — HM retorno < HM saída
  if (hmRetorno < hmSaida) {
    await alertarAdm(sock,
      `🔴 *HM RETORNO INVÁLIDO*\n${cab}\n` +
      `HM Saída: ${String(hmSaida).replace('.', ',')} / HM Retorno: ${String(hmRetorno).replace('.', ',')}\n` +
      `Diferença: ${hmUsado}\n` +
      `Ação: registro bloqueado.\n\nPara corrigir: *corrigir_${idSaida}_R*`
    )
    return { bloqueado: true, motivo: 'HM_RETORNO_MENOR_SAIDA' }
  }

  // CRÍTICO 3 — HM usado < 0,1
  if (hmUsado < 0.1) {
    await alertarAdm(sock,
      `🔴 *HM MUITO BAIXO*\n${cab}\n` +
      `HM Saída: ${String(hmSaida).replace('.', ',')} / HM Retorno: ${String(hmRetorno).replace('.', ',')}\n` +
      `Diferença: ${hmUsado}\n` +
      `Ação: registro bloqueado.\n\nPara corrigir: *corrigir_${idSaida}_R*`
    )
    return { bloqueado: true, motivo: 'HM_USADO_MUITO_BAIXO' }
  }

  // Calcula tempo de navegação em horas
  let tempoNavH = null
  if (dtSaida && dtRetorno) {
    tempoNavH = Number(((new Date(dtRetorno) - new Date(dtSaida)) / 3600000).toFixed(2))
  }

  // CRÍTICO 4 — HM usado > tempo navegação
  if (tempoNavH !== null && hmUsado > tempoNavH) {
    await alertarAdm(sock,
      `🔴 *HM ACIMA DO TEMPO DE NAVEGAÇÃO*\n${cab}\n` +
      `HM usado: ${String(hmUsado).replace('.', ',')}h / Tempo navegação: ${String(tempoNavH).replace('.', ',')}h\n` +
      `Razão: ${Math.round(hmUsado / tempoNavH * 100)}%\n` +
      `Ação: registro bloqueado.\n\nPara corrigir: *corrigir_${idSaida}_R*`
    )
    return { bloqueado: true, motivo: 'HM_ACIMA_TEMPO_NAVEGACAO' }
  }

  // IMPORTANTE 5 — HM usado > 60% tempo navegação
  if (tempoNavH !== null && hmUsado > tempoNavH * 0.6) {
    await alertarAdm(sock,
      `🟡 *HM ALTO EM RELAÇÃO AO TEMPO*\n${cab}\n` +
      `HM usado: ${String(hmUsado).replace('.', ',')}h / Tempo navegação: ${String(tempoNavH).replace('.', ',')}h\n` +
      `Consumo: ${Math.round(hmUsado / tempoNavH * 100)}% (limite 60%)\n` +
      `Registro efetuado. Verificar ocorrência.\n\nPara corrigir: *corrigir_${idSaida}_R*`
    )
  }

  // IMPORTANTE 6 — HM usado < 0,5
  if (hmUsado < 0.5) {
    await alertarAdm(sock,
      `🟡 *HM BAIXO*\n${cab}\n` +
      `HM usado: ${String(hmUsado).replace('.', ',')}h (${Math.round(hmUsado * 60)} min)\n` +
      `Registro efetuado. Verificar se motor foi utilizado normalmente.\n\nPara corrigir: *corrigir_${idSaida}_R*`
    )
  }

  // IMPORTANTE 7 — abandono de registro
  const ausentes = await contarRetornosAusentes(pool, codEmb)
  if (ausentes >= 3) {
    await alertarAdm(sock,
      `🟡 *PADRÃO DE ABANDONO DE REGISTRO*\n${cab}\n` +
      `HM retorno ausente em ${ausentes} viagem(ns) nos últimos 30 dias.\n` +
      `Registro efetuado. Orientar colaborador.\n\nPara ver saídas: *ver_saida_${codEmb}*`
    )
  }

  // IMPORTANTE 8 — HM muito acima da média histórica
  const media = await buscarMediaHMHistorica(pool, codEmb)
  if (media !== null && hmUsado > media * 2.5) {
    await alertarAdm(sock,
      `🟡 *HM ACIMA DA MÉDIA HISTÓRICA*\n${cab}\n` +
      `HM usado hoje: ${String(hmUsado).replace('.', ',')}h / Média histórica: ${String(Number(media.toFixed(1))).replace('.', ',')}h\n` +
      `Desvio: +${Math.round((hmUsado / media - 1) * 100)}%\n` +
      `Registro efetuado. Verificar ocorrência.\n\nPara corrigir: *corrigir_${idSaida}_R*`
    )
  }

  // IMPORTANTE 9 — fora do horário (10h às 21h)
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hora = agora.getHours()
  if (hora < 10 || hora >= 21) {
    await alertarAdm(sock,
      `🟡 *REGISTRO FORA DO HORÁRIO*\n${cab}\n` +
      `Horário do registro: ${String(hora).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}\n` +
      `Horário permitido: 10h às 21h\n` +
      `Registro efetuado. Verificar ocorrência.`
    )
  }

  return { bloqueado: false }
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

    // CRÍTICA HM SAÍDA
    const critica = await criticarHMSaida(
      sock, pool,
      estado.agendamento['ID'],
      estado.agendamento['Cod_Emb_PB'],
      estado.agendamento['Grupo_Comp_letra'],
      estado.agendamento['Dt_Agendamento'],
      estado.colaborador?.Nome || 'Colaborador',
      valor
    )

    if (critica.bloqueado) {
      estadosHoraMotor.delete(key)
      await enviar(sock, grupoId,
        `⚠️ Hora Motor de Saída não aceita. Verifique o valor e tente novamente.\n${VERSAO_HM}`
      )
      return true
    }

    await gravarHoraMotorSaida(pool, estado.agendamento['ID'], valor)

    estado.agendamento['Hora_Motor_Saida'] = valor

    await enviar(sock, grupoId,
      `✅ *Hora Motor de Saída registrada: ${estado.horaInformada}*\n\n` +
      `Emb: ${estado.agendamento['Cod_Emb_PB']} / Grupo: ${estado.agendamento['Grupo_Comp_letra']}\n${VERSAO_HM}`
    )

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

    // CRÍTICA HM RETORNO
    const critica = await criticarHMRetorno(
      sock, pool,
      estado.agendamento['ID'],
      estado.agendamento['Cod_Emb_PB'],
      estado.agendamento['Grupo_Comp_letra'],
      estado.agendamento['Dt_Agendamento'],
      estado.agendamento['Dt_Saída'],
      estado.agendamento['Dt_Retorno'],
      estado.colaborador?.Nome || 'Colaborador',
      Number(estado.agendamento['Hora_Motor_Saida']),
      valor
    )

    if (critica.bloqueado) {
      estadosHoraMotor.delete(key)
      await enviar(sock, grupoId,
        `⚠️ Hora Motor de Retorno não aceita. Verifique o valor e tente novamente.\n${VERSAO_HM}`
      )
      return true
    }

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
