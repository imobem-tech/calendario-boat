// ============================================================
// COMANDO SSS — REGISTRO DE SAÍDA
// Allmax Gestão de Cotas — V.2605260035
// Compatível com pg Pool
//
// Comandos:
//   sss / ssss / SSS  => inicia registro de saída
//   colaborador63984030406
//   colaborador 63984030406
//      => vincula o LID do remetente ao colaborador cadastrado
//
// V.2605252345:
//   - buscarSaidaDoDia retorna TODOS os registros do dia
//   - classifica cada registro em estado (#1 a #10)
//   - exibe histórico completo antes de qualquer ação
//   - permite nova saída mesmo havendo ciclos anteriores completos
// ============================================================

const estadosSaida = new Map()
const VERSAO_SAIDA = 'V.2605260035'

// ============================================================
// HELPERS
// ============================================================

function somenteDigitos(txt) {
  return String(txt || '').replace(/\D+/g, '')
}

function normalizarTexto(txt) {
  return String(txt || '').trim().toLowerCase()
}

function agoraSaoPauloDate() {
  return new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo'
    })
  )
}

function hojeIsoSaoPaulo() {
  const d = agoraSaoPauloDate()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatarDataHoraBR(dt = agoraSaoPauloDate()) {
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  const hh = String(dt.getHours()).padStart(2, '0')
  const mi = String(dt.getMinutes()).padStart(2, '0')
  const ss = String(dt.getSeconds()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`
}

function chaveEstado(grupoId, remetente) {
  return `${grupoId || ''}::${String(remetente || '').trim().toLowerCase()}`
}

function horaMotorValida(txt) {
  return /^\d{3},\d$/.test(String(txt || '').trim())
}

function comandoSaida(txt) {
  return /^s{3,}$/i.test(String(txt || '').trim())
}

function extrairComandoColaborador(txt) {
  const m = String(txt || '').trim().match(/^colaborador\s*(\d{10,13})$/i)
  return m ? m[1] : ''
}

function isLid(remetente) {
  return String(remetente || '').trim().toLowerCase().endsWith('@lid')
}

async function enviar(sock, grupoId, texto) {
  await sock.sendMessage(grupoId, { text: texto })
}

// ============================================================
// TELEFONE — aceita com/sem DDI 55 e com/sem nono dígito
// ============================================================

function variantesTelefoneBR(numeroOriginal) {
  const bruto = somenteDigitos(numeroOriginal)
  const variantes = new Set()

  function add(n) {
    if (n) variantes.add(String(n))
  }

  add(bruto)

  let sem55 = bruto
  if (sem55.startsWith('55') && sem55.length >= 12) {
    sem55 = sem55.slice(2)
    add(sem55)
  }

  // Ex.: 63984030406
  if (sem55.length === 11) {
    const ddd = sem55.slice(0, 2)
    const numero = sem55.slice(2)

    add(sem55)
    add('55' + sem55)

    if (numero.startsWith('9')) {
      const semNove = ddd + numero.slice(1)
      add(semNove)
      add('55' + semNove)
    }
  }

  // Ex.: 6384030406
  if (sem55.length === 10) {
    const ddd = sem55.slice(0, 2)
    const numero = sem55.slice(2)

    add(sem55)
    add('55' + sem55)

    const comNove = ddd + '9' + numero
    add(comNove)
    add('55' + comNove)
  }

  return Array.from(variantes)
}

// ============================================================
// COLABORADOR
// ============================================================

async function listarColaboradores(pool) {
  const rs = await pool.query(`
    SELECT "ID", "Nome", "Telefone", "Administrador", "Lid"
      FROM public.wpp_colaboradores
  `)

  return rs.rows || []
}

function colaboradorBateComTelefone(colab, numero) {
  const variantesNumero = variantesTelefoneBR(numero)
  const variantesColab = variantesTelefoneBR(colab.Telefone)

  return variantesColab.some(v => variantesNumero.includes(v))
}

async function buscarColaboradorPorTelefone(pool, numero) {
  const colaboradores = await listarColaboradores(pool)

  for (const colab of colaboradores) {
    if (colaboradorBateComTelefone(colab, numero)) {
      return colab
    }
  }

  return null
}

async function buscarColaborador(pool, remetente) {
  const remetenteNormalizado = String(remetente || '').trim().toLowerCase()
  const variantesRemetente = variantesTelefoneBR(remetente)

  console.log('DEBUG_COLAB_REMETENTE', {
    remetente,
    variantesRemetente
  })

  const colaboradores = await listarColaboradores(pool)

  for (const colab of colaboradores) {
    const lidColab = String(colab.Lid || '').trim().toLowerCase()

    if (lidColab && lidColab === remetenteNormalizado) {
      console.log('DEBUG_COLAB_LID_MATCH', {
        nome: colab.Nome,
        lid: colab.Lid
      })
      return colab
    }

    const variantesColab = variantesTelefoneBR(colab.Telefone)
    const encontrou = variantesColab.some(v => variantesRemetente.includes(v))

    console.log('DEBUG_COLAB_COMPARE', {
      nome: colab.Nome,
      telefone: colab.Telefone,
      lid: colab.Lid || null,
      variantesColab,
      encontrou
    })

    if (encontrou) {
      // Se achou pelo telefone e o remetente veio como LID, aprende automaticamente.
      if (isLid(remetente) && !lidColab) {
        await pool.query(`
          UPDATE public.wpp_colaboradores
             SET "Lid" = $1
           WHERE "ID" = $2
        `, [remetenteNormalizado, colab.ID])

        colab.Lid = remetenteNormalizado

        console.log('DEBUG_COLAB_LID_AUTO_GRAVADO', {
          nome: colab.Nome,
          lid: remetenteNormalizado
        })
      }

      return colab
    }
  }

  return null
}

// ============================================================
// COMANDO DE VINCULAÇÃO DO LID
// ============================================================

async function vincularLidColaborador(sock, pool, grupoId, remetente, texto) {
  const numeroInformado = extrairComandoColaborador(texto)

  if (!numeroInformado) {
    return false
  }

  const colaborador = await buscarColaboradorPorTelefone(pool, numeroInformado)

  if (!colaborador) {
    await enviar(
      sock,
      grupoId,
      `Não encontrei colaborador com este telefone. Verifique o número cadastrado.\n${VERSAO_SAIDA}`
    )
    return true
  }

  const lid = String(remetente || '').trim().toLowerCase()

  if (!lid) {
    await enviar(sock, grupoId, `Não consegui identificar o remetente para vincular.\n${VERSAO_SAIDA}`)
    return true
  }

  await pool.query(`
    UPDATE public.wpp_colaboradores
       SET "Lid" = $1
     WHERE "ID" = $2
  `, [lid, colaborador.ID])

  await enviar(
    sock,
    grupoId,
    `Colaborador vinculado com sucesso: ${colaborador.Nome}\n${VERSAO_SAIDA}`
  )

  console.log('DEBUG_COLAB_LID_VINCULADO_MANUAL', {
    nome: colaborador.Nome,
    telefone: colaborador.Telefone,
    lid
  })

  return true
}

// ============================================================
// IDENTIFICA EMBARCAÇÃO / GRUPO PELO GRUPO WPP
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

function normalizarGrupoCompLetra(cota) {
  return String(cota || '').trim().toUpperCase()
}

// ============================================================
// BUSCA SAÍDA DO DIA
// ============================================================

async function buscarSaidaDoDia(pool, codEmbPb, grupoCompLetra) {
  const hoje = hojeIsoSaoPaulo()

  const rs = await pool.query(`
    SELECT *
      FROM public."P_BOAT_z_10_Saida_Emb"
     WHERE "Cod_Emb_PB" = $1
       AND UPPER(COALESCE("Grupo_Comp_letra", '')) = UPPER($2)
       AND "Dt_Agendamento" >= ($3::date)
       AND "Dt_Agendamento" <  ($3::date + INTERVAL '1 day')
       AND "Dt_Desistencia"   IS NULL
       AND "Dt_Cancela_saida" IS NULL
  `, [codEmbPb, grupoCompLetra, hoje])

  return rs.rows || []
}

// ============================================================
// BUSCA TODOS OS REGISTROS DO DIA
// ============================================================

async function buscarRegistrosDoDia(pool, codEmbPb, grupoCompLetra) {
  const hoje = hojeIsoSaoPaulo()

  const rs = await pool.query(`
    SELECT *
      FROM public."P_BOAT_z_10_Saida_Emb"
     WHERE "Cod_Emb_PB" = $1
       AND UPPER(COALESCE("Grupo_Comp_letra", '')) = UPPER($2)
       AND "Dt_Agendamento" >= ($3::date)
       AND "Dt_Agendamento" <  ($3::date + INTERVAL '1 day')
     ORDER BY "Dt_Agendamento" ASC
  `, [codEmbPb, grupoCompLetra, hoje])

  return rs.rows || []
}

// ============================================================
// CLASSIFICA ESTADO DE CADA REGISTRO
// ============================================================

function classificarEstado(r) {
  const saida      = r['Dt_Saída']
  const retorno    = r['Dt_Retorno']
  const desist     = r['Dt_Desistencia']
  const cancela    = r['Dt_Cancela_saida']

  if (!saida && !desist && !cancela)           return 1  // aguardando saída
  if (saida  && !retorno && !desist && !cancela) return 2  // em navegação
  if (saida  &&  retorno && !desist && !cancela) return 3  // ciclo completo
  if (!saida &&  desist  && !cancela)            return 4  // desistência cotista
  if (!saida && !desist  &&  cancela)            return 5  // cancelado admin
  if (!saida &&  desist  &&  cancela)            return 6  // desist + cancela
  if (saida  && !retorno &&  desist)             return 7  // inconsistente
  if (saida  && !retorno &&  cancela)            return 8  // inconsistente
  if (!saida &&  retorno)                        return 9  // inconsistente
  if (saida  &&  retorno &&  desist)             return 10 // inconsistente
  return 99 // desconhecido
}

// ============================================================
// FORMATA HORA A PARTIR DE TIMESTAMP
// ============================================================

function extrairHora(dt) {
  if (!dt) return '—'
  const d = dt instanceof Date ? dt : new Date(dt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mi}`
}

// ============================================================
// MONTA RESUMO HISTÓRICO
// ============================================================

function montarResumoHistorico(registros, pb, grupo) {
  const hoje = hojeIsoSaoPaulo()
  const [ano, mes, dia] = hoje.split('-')
  const dataFormatada = `${dia}/${mes}/${ano}`

  const linhas = [`📋 Emb ${pb} / Grupo ${grupo} — ${dataFormatada}\n`]

  // Separa #1 dos demais — #1 sempre aparece por último
  const historico = registros.filter(r => classificarEstado(r) !== 1)
  const aguardando = registros.filter(r => classificarEstado(r) === 1)

  for (const r of [...historico, ...aguardando]) {
    const estado = classificarEstado(r)
    const agHora = extrairHora(r['Dt_Agendamento'])
    const saHora = extrairHora(r['Dt_Saída'])
    const reHora = extrairHora(r['Dt_Retorno'])

    switch (estado) {
      case 1:
        linhas.push(`⏳ Aguardando saída`)
        break
      case 2:
        linhas.push(`🚢 Em navegação\n   Agendado: ${agHora} | Saída: ${saHora}`)
        break
      case 3:
        linhas.push(`✅ Ciclo encerrado\n   Saída: ${saHora} | Retorno: ${reHora}`)
        break
      case 4:
        linhas.push(`❌ Desistência\n   Agendado: ${agHora}`)
        break
      case 5:
      case 6:
        linhas.push(`🚫 Cancelado\n   Agendado: ${agHora}`)
        break
      default:
        linhas.push(`⚠️ Situação irregular\n   Agendado: ${agHora}`)
    }
  }

  return linhas.join('\n')
}

// ============================================================
// REGISTROS
// ============================================================

async function registrarHoraMotor(pool, idSaida, horaMotor) {
  const valor = Number(String(horaMotor).replace(',', '.'))

  await pool.query(`
    UPDATE public."P_BOAT_z_10_Saida_Emb"
       SET "Hora_Motor_Saida" = $1
     WHERE "ID" = $2
  `, [valor, idSaida])
}

async function registrarSaida(pool, saida, colaborador) {
  const agora = agoraSaoPauloDate()
  const agoraBR = formatarDataHoraBR(agora)

  await pool.query(`
    UPDATE public."P_BOAT_z_10_Saida_Emb"
       SET "Dt_Saída" = $1,
           "Dt_Desistencia" = NULL,
           "Colab_Responsavel" = $2
     WHERE "ID" = $3
  `, [agora, colaborador.Nome, saida.ID])

  // P_BOAT_9_OS pode não estar disponível no Neon ainda
  try {
    await pool.query(`
      UPDATE public."P_BOAT_9_OS"
         SET "OS_obs_Fechamento" = $1
       WHERE "OS_Dt_Fechamento" IS NULL
         AND "Num_Emb_PB" = $2
         AND "Tipo" = 'SAÍDA'
    `, [`Decida ou cancelamento em_${agoraBR}  `, saida.Cod_Emb_PB])
  } catch (osErr) {
    console.warn('[registrarSaida] P_BOAT_9_OS indisponível:', osErr.message)
  }

  return agoraBR
}

// ============================================================
// FLUXO
// ============================================================

async function iniciarFluxoSaida(sock, pool, grupoId, remetente) {
  const colaborador = await buscarColaborador(pool, remetente)

  if (!colaborador) {
    await enviar(sock, grupoId, `Comando não aceito. Use: colaborador + telefone cadastrado.\n${VERSAO_SAIDA}`)
    return true
  }

  const grupoAgenda = await buscarGrupoAgenda(pool, grupoId)

  if (!grupoAgenda) {
    await enviar(sock, grupoId, `Não encontrei este grupo na base de grupos da agenda.\n${VERSAO_SAIDA}`)
    return true
  }

  const codEmbPb      = Number(grupoAgenda.pb)
  const grupoCompLetra = normalizarGrupoCompLetra(grupoAgenda.cota)

  console.log('DEBUG_SAIDA_ENTRADA', {
    grupoId, remetente, codEmbPb, grupoCompLetra,
    colaborador: colaborador.Nome
  })

  if (!codEmbPb || !grupoCompLetra) {
    await enviar(sock, grupoId, `Não consegui identificar a embarcação/grupo desta conversa.\n${VERSAO_SAIDA}`)
    return true
  }

  // Busca TODOS os registros do dia
  const registros = await buscarRegistrosDoDia(pool, codEmbPb, grupoCompLetra)

  // Sem nenhum registro
  if (!registros.length) {
    await enviar(sock, grupoId, `Não encontrei agendamento de saída para esta embarcação/grupo hoje.\n${VERSAO_SAIDA}`)
    return true
  }

  // Monta e exibe histórico
  const resumo = montarResumoHistorico(registros, codEmbPb, grupoCompLetra)

  // Classifica todos
  const estados = registros.map(r => ({ r, estado: classificarEstado(r) }))

  // Verifica navegação ativa (#2)
  const emNavegacao = estados.filter(e => e.estado === 2)
  if (emNavegacao.length > 0) {
    await enviar(sock, grupoId, `${resumo}\n\nEsta embarcação já está em navegação.\n${VERSAO_SAIDA}`)
    return true
  }

  // Filtra aguardando saída (#1)
  const aguardando = estados.filter(e => e.estado === 1)

  if (aguardando.length === 0) {
    await enviar(sock, grupoId, `${resumo}\n\nNão há agendamento ativo para hoje.\n${VERSAO_SAIDA}`)
    return true
  }

  if (aguardando.length > 1) {
    await enviar(sock, grupoId, `${resumo}\n\n⚠️ Situação irregular: mais de um agendamento ativo. Contate o administrador.\n${VERSAO_SAIDA}`)
    return true
  }

  // Exatamente um #1 — prossegue para registrar saída
  const saida = aguardando[0].r
  const key   = chaveEstado(grupoId, remetente)

  const precisaHoraMotor =
    Number(saida['Cod_Proprietário']) === 4255 &&
    (saida.Hora_Motor_Saida === null ||
     saida.Hora_Motor_Saida === undefined ||
     saida.Hora_Motor_Saida === '')

  if (precisaHoraMotor) {
    estadosSaida.set(key, {
      etapa: 'aguardando_hora_motor_saida',
      saida,
      colaborador,
      resumo
    })

    await enviar(sock, grupoId, `${resumo}\n\nInforme a Hora Motor de Saída, no formato *000,0*, ou D para desistir\n${VERSAO_SAIDA}`)
    return true
  }

  estadosSaida.set(key, {
    etapa: 'aguardando_confirmacao_saida',
    saida,
    colaborador,
    resumo
  })

  await enviar(sock, grupoId, `${resumo}\n\nConfirma saída? S/N\n${VERSAO_SAIDA}`)
  return true
}

async function tratarEstadoSaida(sock, pool, grupoId, remetente, texto) {
  const key = chaveEstado(grupoId, remetente)
  const estado = estadosSaida.get(key)

  if (!estado) {
    return false
  }

  const msg = normalizarTexto(texto)

  if (msg === 'd') {
    estadosSaida.delete(key)
    await enviar(sock, grupoId, `Desistência registrada.\n${VERSAO_SAIDA}`)
    return true
  }

  if (estado.etapa === 'aguardando_hora_motor_saida') {
    if (!horaMotorValida(texto)) {
      await enviar(sock, grupoId, `Informe a Hora Motor de Saída, no formato 000,0, ou D para desistir\n${VERSAO_SAIDA}`)
      return true
    }

    estado.horaMotorInformada = String(texto).trim()
    estado.etapa = 'aguardando_confirmacao_hora_motor'
    estadosSaida.set(key, estado)

    await enviar(sock, grupoId, `CONFIRMA *${estado.horaMotorInformada}*? S/N ou D para desistir/corrigir\n${VERSAO_SAIDA}`)
    return true
  }

  if (estado.etapa === 'aguardando_confirmacao_hora_motor') {
    if (msg === 'n') {
      estado.etapa = 'aguardando_hora_motor_saida'
      estado.horaMotorInformada = ''
      estadosSaida.set(key, estado)

      await enviar(sock, grupoId, `Informe a Hora Motor de Saída, no formato *000,0*, ou D para desistir\n${VERSAO_SAIDA}`)
      return true
    }

    if (msg !== 's') {
      await enviar(sock, grupoId, `CONFIRMA *${estado.horaMotorInformada}*? S/N ou D para desistir/corrigir\n${VERSAO_SAIDA}`)
      return true
    }

    await registrarHoraMotor(pool, estado.saida.ID, estado.horaMotorInformada)

    estado.saida.Hora_Motor_Saida = Number(
      estado.horaMotorInformada.replace(',', '.')
    )

    estado.etapa = 'aguardando_confirmacao_saida'
    estadosSaida.set(key, estado)

    await enviar(sock, grupoId, `Confirma saída? S/N\n${VERSAO_SAIDA}`)
    return true
  }

  if (estado.etapa === 'aguardando_confirmacao_saida') {
    if (msg === 'n') {
      estadosSaida.delete(key)
      await enviar(sock, grupoId, `Saída não confirmada.\n${VERSAO_SAIDA}`)
      return true
    }

    if (msg !== 's') {
      await enviar(sock, grupoId, `Confirma saída? S/N\n${VERSAO_SAIDA}`)
      return true
    }

    const dataHoraBR = await registrarSaida(pool, estado.saida, estado.colaborador)

    estadosSaida.delete(key)

    let resposta = `*Saída confirmada* — ${dataHoraBR}\n\n` +
      `Embarcação: ${estado.saida.Cod_Emb_PB}\n` +
      `Grupo: ${estado.saida.Grupo_Comp_letra}\n` +
      `Colaborador: ${estado.colaborador.Nome}`

    if (
      estado.saida.Hora_Motor_Saida !== null &&
      estado.saida.Hora_Motor_Saida !== undefined
    ) {
      resposta += `\nHora Motor Saída: ${String(estado.saida.Hora_Motor_Saida).replace('.', ',')}`
    }

    resposta += `\n${VERSAO_SAIDA}`

    await enviar(sock, grupoId, resposta)
    return true
  }

  return false
}

// ============================================================
// EXPORT PRINCIPAL
// ============================================================

export async function tratarComandoSaida(sock, pool, grupoId, remetente, texto) {
  // Primeiro trata estado já aberto.
  const estadoTratado = await tratarEstadoSaida(sock, pool, grupoId, remetente, texto)

  if (estadoTratado) {
    return true
  }

  // Depois trata vinculação colaborador + telefone.
  const vinculou = await vincularLidColaborador(sock, pool, grupoId, remetente, texto)

  if (vinculou) {
    return true
  }

  // Por fim trata comando de saída.
  if (!comandoSaida(texto)) {
    return false
  }

  return await iniciarFluxoSaida(sock, pool, grupoId, remetente)
}
