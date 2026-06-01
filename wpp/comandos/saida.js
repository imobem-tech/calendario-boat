// ============================================================
// COMANDO SSS — REGISTRO DE SAÍDA
// Allmax Gestão de Cotas
// Compatível com pg Pool
// V.2605311552
//
// Comandos:
//   sss / ssss / SSS  => inicia registro de saída
//   colaborador63984030406
//   colaborador 63984030406
//      => vincula o LID do remetente ao colaborador cadastrado
// ============================================================

const estadosSaida = new Map()
const VERSAO_SAIDA = 'V.2605310539'

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
      'Não encontrei colaborador com este telefone. Verifique o número cadastrado.'
    )
    return true
  }

  const lid = String(remetente || '').trim().toLowerCase()

  if (!lid) {
    await enviar(sock, grupoId, 'Não consegui identificar o remetente para vincular.')
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
    `Colaborador vinculado com sucesso: ${colaborador.Nome}`
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

// ============================================================
// BUSCA NOME DA EMBARCAÇÃO
// ============================================================
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

function normalizarGrupoCompLetra(cota, nomeGrupo) {
  const cotaStr = String(cota || '').trim().toUpperCase()
  if (cotaStr) return cotaStr
  // cota nula: extrai do nome do grupo (ex: "151-11 _C SUMMER..." → "11")
  const m = String(nomeGrupo || '').match(/^\d+-([A-Z0-9]+)/i)
  return m ? m[1].toUpperCase() : ''
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
       AND DATE("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = $3::date
  `, [codEmbPb, grupoCompLetra, hoje])

  return rs.rows || []
}

// ============================================================
// VERIFICA INADIMPLÊNCIA
// ============================================================

async function verificarInadimplencia(pool, codAutorizado) {
  if (!codAutorizado || codAutorizado <= 0) return false

  const rs = await pool.query(
    `SELECT EXISTS (
       SELECT 1
         FROM public."Contas_Receber"
        WHERE "Código_Cliente" = $1
          AND "Data_Pagamento" IS NULL
          AND "Data_Vencimento" < CURRENT_DATE - INTERVAL '3 days'
     ) AS inadimplente`,
    [codAutorizado]
  )

  return rs.rows[0]?.inadimplente === true
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
       SET "Dt_Saída" = NOW() AT TIME ZONE 'America/Sao_Paulo',
           "Dt_Desistencia" = NULL,
           "Colab_Responsavel" = $1
     WHERE "ID" = $2
  `, [colaborador.Nome, saida.ID])

  await pool.query(`
    UPDATE public."P_BOAT_9_OS"
       SET "OS_obs_Fechamento" = $1
     WHERE "OS_Dt_Fechamento" IS NULL
       AND "Num_Emb_PB" = $2
       AND "Tipo" = 'SAÍDA'
  `, [`Decida ou cancelamento em_${agoraBR}  `, saida.Cod_Emb_PB])

  return agoraBR
}

// ============================================================
// FLUXO
// ============================================================

async function iniciarFluxoSaida(sock, pool, grupoId, remetente) {
  const colaborador = await buscarColaborador(pool, remetente)

  if (!colaborador) {
    await enviar(sock, grupoId, 'Comando não aceito. Use: colaborador + telefone cadastrado.')
    return true
  }

  const grupoAgenda = await buscarGrupoAgenda(pool, grupoId)

  if (!grupoAgenda) {
    await enviar(sock, grupoId, 'Não encontrei este grupo na base de grupos da agenda.')
    return true
  }

  const codEmbPb = Number(grupoAgenda.pb)
  const grupoCompLetra = normalizarGrupoCompLetra(grupoAgenda.cota, grupoAgenda.nomegrupowpp)
  const dadosEmbar    = await buscarDadosEmbar(pool, codEmbPb)
  const nomeEmbar     = dadosEmbar["Nome_Embar"] || ""

  console.log('DEBUG_SAIDA_ENTRADA', {
    grupoId,
    remetente,
    codEmbPb,
    grupoCompLetra,
    colaborador: colaborador.Nome
  })

  if (!codEmbPb || !grupoCompLetra) {
    await enviar(sock, grupoId, 'Não consegui identificar a embarcação/grupo desta conversa.')
    return true
  }

  const saidas = await buscarSaidaDoDia(pool, codEmbPb, grupoCompLetra)

  if (!saidas.length) {
    await enviar(sock, grupoId, 'Não encontrei agendamento de saída para esta embarcação/grupo hoje.')
    return true
  }

  if (saidas.length > 1) {
    await enviar(sock, grupoId, 'Encontrei mais de uma saída para hoje. Não consegui registrar automaticamente.')
    return true
  }

  const saida = saidas[0]

  if (saida.Dt_Desistencia) {
    await enviar(sock, grupoId, 'Esta saída consta como desistência. Não é possível registrar a saída.')
    return true
  }

  if (saida.Dt_Cancela_saida) {
    await enviar(sock, grupoId, 'Esta saída consta como cancelada. Não é possível registrar a saída.')
    return true
  }

  if (saida['Dt_Saída']) {
    await enviar(sock, grupoId, 'Esta embarcação já teve a saída registrada hoje.')
    return true
  }

  // ----------------------------------------------------------
  // Verifica inadimplência do Cod_Autorizado
  // ----------------------------------------------------------
  const codAutorizado = Number(
    saida['Cod_Autorizado'] ??
    saida['cod_autorizado'] ??
    0
  )

  if (codAutorizado > 0) {
    try {
      const inadimplente = await verificarInadimplencia(pool, codAutorizado)

      if (inadimplente) {
        console.log('[SAIDA_BLOQUEADA] Inadimplente:', { codAutorizado, codEmbPb, grupoCompLetra })
        await enviar(sock, grupoId,
          `⛔ *SAÍDA BLOQUEADA*\n\n` +
          `Cliente Cód. ${codAutorizado} possui conta(s) vencida(s) há mais de 3 dias.\n\n` +
          `Regularize a situação financeira para liberar a saída.\n\n${VERSAO_SAIDA}`
        )
        return true
      }
    } catch (errInadim) {
      console.warn('[SAIDA] Falha ao verificar inadimplência, liberando saída:', errInadim.message)
    }
  }

  const key = chaveEstado(grupoId, remetente)

  const precisaHoraMotor =
    Number(saida['Cod_Proprietário']) === 4255 &&
    (
      saida.Hora_Motor_Saida === null ||
      saida.Hora_Motor_Saida === undefined ||
      saida.Hora_Motor_Saida === ''
    )

  if (precisaHoraMotor) {
    estadosSaida.set(key, {
      etapa: 'aguardando_hora_motor_saida',
      saida,
      colaborador,
      nomeEmbar
    })

    await enviar(sock, grupoId, 'Informe a Hora Motor de Saída, no formato 000,0, ou D para desistir')
    return true
  }

  estadosSaida.set(key, {
    etapa: 'aguardando_confirmacao_saida',
    saida,
    colaborador,
    nomeEmbar
  })

  await enviar(sock, grupoId, 'Confirma saída? S/N')
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
    await enviar(sock, grupoId, 'Desistência registrada.')
    return true
  }

  if (estado.etapa === 'aguardando_hora_motor_saida') {
    if (!horaMotorValida(texto)) {
      await enviar(sock, grupoId, 'Informe a Hora Motor de Saída, no formato 000,0, ou D para desistir')
      return true
    }

    estado.horaMotorInformada = String(texto).trim()
    estado.etapa = 'aguardando_confirmacao_hora_motor'
    estadosSaida.set(key, estado)

    await enviar(sock, grupoId, `CONFIRMA ${estado.horaMotorInformada}? S/N ou D para desistir/corrigir`)
    return true
  }

  if (estado.etapa === 'aguardando_confirmacao_hora_motor') {
    if (msg === 'n') {
      estado.etapa = 'aguardando_hora_motor_saida'
      estado.horaMotorInformada = ''
      estadosSaida.set(key, estado)

      await enviar(sock, grupoId, 'Informe a Hora Motor de Saída, no formato 000,0, ou D para desistir')
      return true
    }

    if (msg !== 's') {
      await enviar(sock, grupoId, `CONFIRMA ${estado.horaMotorInformada}? S/N ou D para desistir/corrigir`)
      return true
    }

    await registrarHoraMotor(pool, estado.saida.ID, estado.horaMotorInformada)

    estado.saida.Hora_Motor_Saida = Number(
      estado.horaMotorInformada.replace(',', '.')
    )

    estado.etapa = 'aguardando_confirmacao_saida'
    estadosSaida.set(key, estado)

    await enviar(sock, grupoId, 'Confirma saída? S/N')
    return true
  }

  if (estado.etapa === 'aguardando_confirmacao_saida') {
    if (msg === 'n') {
      estadosSaida.delete(key)
      await enviar(sock, grupoId, 'Saída não confirmada.')
      return true
    }

    if (msg !== 's') {
      await enviar(sock, grupoId, 'Confirma saída? S/N')
      return true
    }

    const dataHoraBR = await registrarSaida(pool, estado.saida, estado.colaborador)

    estadosSaida.delete(key)

    const _nomeEmbarSaida = estado.nomeEmbar || ""
    let resposta =
      `*Saída confirmada* — ${dataHoraBR}\n\n` +
      `*${estado.saida.Cod_Emb_PB}-${estado.saida.Grupo_Comp_letra}*\n` +
      (_nomeEmbarSaida ? `${_nomeEmbarSaida}\n` : "") +
      `Colaborador: ${estado.colaborador.Nome}`

    if (
      estado.saida.Hora_Motor_Saida !== null &&
      estado.saida.Hora_Motor_Saida !== undefined
    ) {
      resposta += `\nHora Motor Saída: ${String(estado.saida.Hora_Motor_Saida).replace('.', ',')}`
    }

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
export { buscarColaborador }
