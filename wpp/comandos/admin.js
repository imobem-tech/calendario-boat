// ============================================================
// wpp/comandos/admin.js — V.2606051940
// Allmax Gestão de Cotas — Marujo⚓
//
// Módulo administrativo — só funciona no grupo ADM
// Exige Administrador = S na wpp_colaboradores
//
// Comandos:
//   ver_saida_151          — últimas 5 saídas retroativas da emb 151
//   ver_saida_151_11       — últimas 5 saídas retroativas da emb 151 grupo 11
//   lista_saida_151_10     — últimas 10 saídas retroativas da emb 151
//   lista_saida_151_11_15  — últimas 15 saídas retroativas da emb 151 grupo 11
//   ver_colab              — lista colaboradores ativos
//   ver_emb_151            — dados da embarcação 151
//   corrigir_4521_S        — corrige HM Saída do ID 4521
//   corrigir_4521_R        — corrige HM Retorno do ID 4521
//   help                   — lista todos os comandos
//
// FIX V.2606051940:
// - ver_saida agora filtra apenas saídas retroativas (≤ hoje)
// - Exclui canceladas (Dt_Cancela_saida) e desistidas (Dt_Desistencia)
// - Novo comando lista_saida com quantidade parametrizada (máx 50)
// ============================================================

import { gerarCobrancaCompleta } from '../asaas.js'

const GRUPO_ADM = '556332258473-1556910161@g.us'

const CABECALHO =
`\`\`\`Olá, sou o seu
Assistente Virtual\`\`\` *Marujo⚓*
\`\`\`--------------------------\`\`\``

// Estado de correção em andamento
// chave: remetente | valor: { tipo (S|R), idSaida, etapa, valorAtual, nomeColab, emb, grupo }
const estadosCorrecao = new Map()

const VERSAO_ADM = 'V.2606051940'

// ============================================================
// HELPERS
// ============================================================

async function enviar(sock, texto) {
  await sock.sendMessage(GRUPO_ADM, { text: texto })
}

function horaMotorValida(txt) {
  return /^\d{3},\d$/.test(String(txt || '').trim())
}

function formatarHM(v) {
  if (v === null || v === undefined || v === '') return '—'
  return String(v).replace('.', ',')
}

function formatarDataHora(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })
    .replace(',', '')
}

function formatarData(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// ============================================================
// VALIDAÇÃO DE ADMIN
// ============================================================

async function validarAdmin(pool, remetente) {
  const jid = String(remetente || '').trim().toLowerCase()

  const { rows } = await pool.query(`
    SELECT "ID", "Nome", "Administrador"
      FROM public.wpp_colaboradores
     WHERE LOWER(TRIM("Lid")) = $1
       AND COALESCE("Administrador", 'N') = 'S'
       AND COALESCE("Ativo", 'S') = 'S'
     LIMIT 1
  `, [jid])

  if (rows[0]) return rows[0]

  // Tenta por telefone
  const tel = jid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '')
  const variantes = [tel, `55${tel}`, tel.replace(/^55/, '')]

  for (const v of variantes) {
    const { rows: r2 } = await pool.query(`
      SELECT "ID", "Nome", "Administrador"
        FROM public.wpp_colaboradores
       WHERE REPLACE(REPLACE("Telefone", '+', ''), ' ', '') ILIKE $1
         AND COALESCE("Administrador", 'N') = 'S'
         AND COALESCE("Ativo", 'S') = 'S'
       LIMIT 1
    `, [`%${v}`])
    if (r2[0]) return r2[0]
  }

  return null
}

// ============================================================
// COMANDOS DE CONSULTA
// ============================================================

async function cmdVerSaida(sock, pool, emb, grupo, limite = 5) {
  const params = [Number(emb)]
  let filtroGrupo = ''
  if (grupo) {
    filtroGrupo = `AND "Grupo_Comp_letra" = $2`
    params.push(grupo.toUpperCase())
  }

  const { rows } = await pool.query(`
    SELECT s."ID",
           s."Grupo_Comp_letra",
           s."Dt_Agendamento",
           s."Dt_Saída",
           s."Dt_Retorno",
           s."Hora_Motor_Saida",
           s."Hora_Motor_Retorno",
           s."Cod_Autorizado",
           s."Dt_Desistencia",
           s."Dt_Cancela_saida",
           c."Cliente_Nome"
      FROM public."P_BOAT_z_10_Saida_Emb" s
      LEFT JOIN public."Cliente" c ON c."Codigo" = s."Cod_Autorizado"
     WHERE s."Cod_Emb_PB" = $1
       AND DATE(s."Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') <= CURRENT_DATE
       AND s."Dt_Desistencia" IS NULL
       AND s."Dt_Cancela_saida" IS NULL
       ${filtroGrupo}
     ORDER BY s."Dt_Agendamento" DESC
     LIMIT $${grupo ? 3 : 2}
  `, [...params, Number(limite)])

  if (!rows.length) {
    await enviar(sock, `${CABECALHO}\n📋 Nenhuma saída encontrada para Emb ${emb}${grupo ? ' / Grupo ' + grupo : ''} (retroativas, sem cancelamento).`)
    return
  }

  let msg = `${CABECALHO}\n📋 *Últimas ${limite} saídas — Emb ${emb}${grupo ? ' / Grupo ' + grupo : ''}*\n`
  msg += `(Retroativas, sem cancelamento/desistência)\n`
  msg += `${'─'.repeat(30)}\n`

  for (const r of rows) {
    const status = r.Dt_Desistencia ? '❌ Desistência' : r.Dt_Cancela_saida ? '❌ Cancelada' : r.Dt_Retorno ? '✅ Retornada' : r['Dt_Saída'] ? '🚤 Em uso' : '📅 Agendada'
    msg += `\n*ID ${r.ID}* | Grupo ${r.Grupo_Comp_letra} | ${formatarData(r.Dt_Agendamento)}\n`
    msg += `Status: ${status}\n`
    msg += `Saída: ${formatarDataHora(r['Dt_Saída'])} | Retorno: ${formatarDataHora(r.Dt_Retorno)}\n`
    msg += `HM S: ${formatarHM(r.Hora_Motor_Saida)} | HM R: ${formatarHM(r.Hora_Motor_Retorno)}\n`
    msg += `Autorizado: ${r.Cliente_Nome || r.Cod_Autorizado}\n`
    msg += `${'─'.repeat(30)}\n`
  }

  msg += `\n${VERSAO_ADM}`
  await enviar(sock, msg)
}

async function cmdVerColab(sock, pool) {
  const { rows } = await pool.query(`
    SELECT "ID", "Nome", "Telefone",
           COALESCE("Administrador", 'N') AS "Administrador",
           COALESCE("Local", '?') AS "Local"
      FROM public.wpp_colaboradores
     WHERE COALESCE("Ativo", 'S') = 'S'
     ORDER BY "Nome"
  `)

  if (!rows.length) {
    await enviar(sock, `${CABECALHO}\n👥 Nenhum colaborador ativo encontrado.`)
    return
  }

  let msg = `${CABECALHO}\n👥 *Colaboradores ativos*\n${'─'.repeat(30)}\n`
  for (const r of rows) {
    const adm = r.Administrador === 'S' ? ' ⭐ADM' : ''
    msg += `${r.ID} | ${r.Nome}${adm} | ${r.Telefone} | Local: ${r.Local}\n`
  }
  msg += `\n${VERSAO_ADM}`
  await enviar(sock, msg)
}

async function cmdVerEmb(sock, pool, emb) {
  const { rows } = await pool.query(`
    SELECT e."Num_PB", e."Nome_Embar", e."Tipo_Embar",
           e."Marca", e."Modelo", e."Motor_nome",
           e."Plano_Contrato", e."Vinculo_Hora_Motor",
           h."Desc_Hora_Moror", h."Valor_Hora_Motor"
      FROM public."P_BOAT_1_Embarcacao" e
      LEFT JOIN public."Hora_Motor_Valor_Atual" h
        ON h."Cod_Hora_Motor" = e."Vinculo_Hora_Motor"
     WHERE e."Num_PB" = $1
     LIMIT 1
  `, [Number(emb)])

  if (!rows[0]) {
    await enviar(sock, `${CABECALHO}\n🚤 Embarcação ${emb} não encontrada.`)
    return
  }

  const r = rows[0]
  let msg = `${CABECALHO}\n🚤 *Embarcação ${emb}*\n${'─'.repeat(30)}\n`
  msg += `Nome: ${r.Nome_Embar}\n`
  msg += `Tipo: ${r.Tipo_Embar} | ${r.Marca} ${r.Modelo}\n`
  msg += `Motor: ${r.Motor_nome}\n`
  msg += `Plano: ${r.Plano_Contrato}\n`
  msg += `Tarifa HM: ${r.Desc_Hora_Moror || 'Não configurada'}`
  if (r.Valor_Hora_Motor) msg += ` — R$ ${Number(r.Valor_Hora_Motor).toFixed(2).replace('.', ',')}`
  msg += `\n${VERSAO_ADM}`
  await enviar(sock, msg)
}

// ============================================================
// COMANDO CORRIGIR
// ============================================================

async function cmdCorrigir(sock, pool, remetente, idSaida, tipo) {
  const { rows } = await pool.query(`
    SELECT s."ID", s."Cod_Emb_PB", s."Grupo_Comp_letra",
           s."Dt_Agendamento", s."Hora_Motor_Saida", s."Hora_Motor_Retorno",
           s."Dt_Saída", s."Dt_Retorno", s."Cod_Autorizado",
           g.grupowppid,
           h."Valor_Hora_Motor"
      FROM public."P_BOAT_z_10_Saida_Emb" s
      LEFT JOIN public.wpp_grupos_agenda g
        ON g.pb = s."Cod_Emb_PB"
       AND UPPER(COALESCE(g.cota,'')) = UPPER(COALESCE(s."Grupo_Comp_letra",''))
      LEFT JOIN public."P_BOAT_1_Embarcacao" e ON e."Num_PB" = s."Cod_Emb_PB"
      LEFT JOIN public."Hora_Motor_Valor_Atual" h ON h."Cod_Hora_Motor" = e."Vinculo_Hora_Motor"
     WHERE s."ID" = $1
     LIMIT 1
  `, [Number(idSaida)])

  if (!rows[0]) {
    await enviar(sock, `${CABECALHO}\n❌ ID ${idSaida} não encontrado.`)
    return
  }

  const s = rows[0]
  const tipoLabel = tipo === 'S' ? 'HM SAÍDA' : 'HM RETORNO'
  const valorAtual = tipo === 'S' ? s.Hora_Motor_Saida : s.Hora_Motor_Retorno

  estadosCorrecao.set(remetente, {
    etapa: 'aguardando_valor',
    tipo,
    idSaida: Number(idSaida),
    valorAtual,
    emb: s.Cod_Emb_PB,
    grupo: s.Grupo_Comp_letra,
    dtAgendamento: s.Dt_Agendamento,
    codAutorizado: s.Cod_Autorizado,
    grupowppid: s.grupowppid,
    valorHoraMotor: s.Valor_Hora_Motor,
    hmSaidaAtual: s.Hora_Motor_Saida,
    hmRetornoAtual: s.Hora_Motor_Retorno
  })

  await enviar(sock,
    `${CABECALHO}\n` +
    `🔧 *Modo correção — ID ${idSaida} / ${tipoLabel}*\n` +
    `Emb: ${s.Cod_Emb_PB} / Grupo: ${s.Grupo_Comp_letra} — ${formatarData(s.Dt_Agendamento)}\n` +
    `Valor atual: ${formatarHM(valorAtual)}\n\n` +
    `Informe o novo valor no formato *000,0*\nou D para cancelar\n\n${VERSAO_ADM}`
  )
}

// ------------------------------------------------------------
// Gera CR após correção de HM Retorno
// Crítico (bloquearia) → alerta ADM "GERE COBRANÇA MANUAL"
// Não crítico          → gera CR + envia boleto no grupo
// ------------------------------------------------------------
async function gerarCRPosCorrecao(sock, pool, estado, hmRetorno) {
  const hmSaida = Number(estado.hmSaidaAtual)
  if (!hmSaida || isNaN(hmSaida) || isNaN(hmRetorno)) {
    await enviar(sock, `⚠️ Dados insuficientes para gerar CR automaticamente (ID ${estado.idSaida}).`)
    return
  }

  const hmUsado = Number((hmRetorno - hmSaida).toFixed(1))

  // Verifica criticidade: valores que bloqueariam no fluxo normal
  const eCritico = hmRetorno < hmSaida || hmUsado < 0.1

  if (eCritico) {
    await enviar(sock,
      `⛔ *GERE COBRANÇA MANUAL*\n` +
      `ID ${estado.idSaida} / Emb ${estado.emb} / Grupo ${estado.grupo}\n` +
      `HM Saída: ${formatarHM(hmSaida)} | HM Retorno: ${formatarHM(hmRetorno)}\n` +
      `HM Usado: ${String(hmUsado).replace('.', ',')}h — caso crítico, cobrança não gerada.`
    )
    return
  }

  if (!estado.codAutorizado || !estado.valorHoraMotor) {
    await enviar(sock, `⚠️ Sem cliente ou tarifa para gerar CR (ID ${estado.idSaida}). Gere manualmente.`)
    return
  }

  try {
    const valor = Number((hmUsado * Number(estado.valorHoraMotor)).toFixed(2))
    const dtAg  = new Date(estado.dtAgendamento)
    const dtBR  = `${String(dtAg.getDate()).padStart(2,'0')}/${String(dtAg.getMonth()+1).padStart(2,'0')}/${dtAg.getFullYear()}`
    const descricao = `Hora_MOTOR ${estado.emb}-${estado.grupo} ${dtBR} ${hmUsado.toFixed(1)}h`

    const vencimento = new Date()
    vencimento.setDate(vencimento.getDate() + 2)

    const resultado = await gerarCobrancaCompleta(pool, 8, estado.codAutorizado, {
      valor, descricao, vencimento, centroCusto: '8'
    })

    // Confirma no ADM
    await enviar(sock,
      `✅ *CR gerada automaticamente*\n` +
      `ID ${estado.idSaida} | ${descricao}\n` +
      `Valor: R$ ${valor.toFixed(2).replace('.', ',')} | CR nº ${resultado.codigo}\n` +
      `🔗 ${resultado.linkBoleto}`
    )

    // Envia boleto no grupo da embarcação
    if (estado.grupowppid) {
      const cabHM = `\`\`\`Olá, sou o seu\nAssistente Virtual\`\`\` *Marujo⚓*\n\`\`\`--------------------------\`\`\``
      await sock.sendMessage(estado.grupowppid, {
        text:
          `${cabHM}\n` +
          `*REPASSE_DE_CUSTOS/HORA_MOTOR*\n\n` +
          `Horímetro - *Saída*: ${formatarHM(hmSaida)}  *Retorno*: ${formatarHM(hmRetorno)}\n` +
          `*Descrição:*\n${descricao}\n\n` +
          `*Valor:* R$ ${valor.toFixed(2).replace('.', ',')}\n` +
          `*Link Boleto/PIX:* ${resultado.linkBoleto}\n\n` +
          `Para pagamento *à vista*!`
      })
    }
  } catch (err) {
    // 🚨 ALERTA CRÍTICO - Correção manual de HM falhou ao gerar CR
    await enviar(sock,
      `🚨 *ERRO CRÍTICO - COBRANÇA NÃO GERADA*\n\n` +
      `⚠️ *AÇÃO MANUAL NECESSÁRIA*\n\n` +
      `*Tipo:* Correção Hora Motor (ADM)\n` +
      `*ID Saída:* ${estado.idSaida}\n` +
      `*Embarcação:* ${estado.emb}\n` +
      `*Grupo:* ${estado.grupo}\n` +
      `*Cliente:* ${estado.codAutorizado}\n` +
      `*HM Saída:* ${formatarHM(estado.hmSaida || 0)}\n` +
      `*HM Retorno:* ${formatarHM(estado.hmRetorno || 0)}\n\n` +
      `*Erro:* ${err.message}\n\n` +
      `⚠️ *GERAR COBRANÇA MANUALMENTE NO SISTEMA*`
    )
  }
}

async function tratarEstadoCorrecao(sock, pool, remetente, texto, nomeAdmin) {
  const estado = estadosCorrecao.get(remetente)
  if (!estado) return false

  const msg = String(texto || '').trim().toLowerCase()

  if (msg === 'd') {
    estadosCorrecao.delete(remetente)
    await enviar(sock, `${CABECALHO}\n❌ Correção cancelada.\n${VERSAO_ADM}`)
    return true
  }

  if (estado.etapa === 'aguardando_valor') {
    if (!horaMotorValida(texto)) {
      await enviar(sock, `Informe o valor no formato *000,0* ou D para cancelar`)
      return true
    }

    estado.novoValor = String(texto).trim()
    estado.etapa = 'aguardando_confirmacao'
    estadosCorrecao.set(remetente, estado)

    const tipoLabel = estado.tipo === 'S' ? 'HM SAÍDA' : 'HM RETORNO'
    await enviar(sock,
      `${CABECALHO}\n` +
      `CONFIRMA *${estado.novoValor}* como ${tipoLabel} do ID ${estado.idSaida}?\n` +
      `S/N ou D para cancelar\n\n${VERSAO_ADM}`
    )
    return true
  }

  if (estado.etapa === 'aguardando_confirmacao') {
    if (msg === 'n' || msg === 'd') {
      estadosCorrecao.delete(remetente)
      await enviar(sock, `${CABECALHO}\n❌ Correção cancelada.\n${VERSAO_ADM}`)
      return true
    }

    if (msg !== 's') {
      const tipoLabel = estado.tipo === 'S' ? 'HM SAÍDA' : 'HM RETORNO'
      await enviar(sock, `CONFIRMA *${estado.novoValor}* como ${tipoLabel} do ID ${estado.idSaida}? S/N`)
      return true
    }

    // Grava a correção
    const campo = estado.tipo === 'S' ? '"Hora_Motor_Saida"' : '"Hora_Motor_Retorno"'
    const novoValorNum = Number(estado.novoValor.replace(',', '.'))

    await pool.query(`
      UPDATE public."P_BOAT_z_10_Saida_Emb"
         SET ${campo} = $1
       WHERE "ID" = $2
    `, [novoValorNum, estado.idSaida])

    estadosCorrecao.delete(remetente)

    const tipoLabel = estado.tipo === 'S' ? 'HM Saída' : 'HM Retorno'
    await enviar(sock,
      `${CABECALHO}\n` +
      `✅ *${tipoLabel} corrigido: ${estado.novoValor}*\n` +
      `ID: ${estado.idSaida} / Emb: ${estado.emb} / Grupo: ${estado.grupo}\n` +
      `Anterior: ${formatarHM(estado.valorAtual)} → Novo: ${estado.novoValor}\n` +
      `Corrigido por: ${nomeAdmin}\n\n${VERSAO_ADM}`
    )

    // Tenta gerar CR automática após correção do HM Retorno
    if (estado.tipo === 'R') {
      await gerarCRPosCorrecao(sock, pool, estado, novoValorNum)
    }

    return true
  }

  return false
}

// ============================================================
// COMANDO HELP
// ============================================================

async function cmdHelp(sock) {
  await enviar(sock,
    `${CABECALHO}\n` +
    `📖 *Comandos disponíveis — Marujo ADM*\n` +
    `${'─'.repeat(30)}\n\n` +
    `📋 *CONSULTA*\n` +
    `ver_saida_151 — últimas 5 saídas retroativas emb 151\n` +
    `ver_saida_151_11 — últimas 5 saídas retroativas emb 151 grupo 11\n` +
    `lista_saida_151_10 — últimas 10 saídas emb 151\n` +
    `lista_saida_151_11_15 — últimas 15 saídas emb 151 grupo 11\n` +
    `ver_colab — lista colaboradores ativos\n` +
    `ver_emb_151 — dados da embarcação 151\n\n` +
    `🔧 *CORREÇÃO*\n` +
    `corrigir_4521_S — corrige HM Saída do ID 4521\n` +
    `corrigir_4521_R — corrige HM Retorno do ID 4521\n\n` +
    `❓ *AJUDA*\n` +
    `help — este menu\n\n` +
    `ℹ️ *Saídas retroativas:* apenas ≤ hoje, sem cancelamento/desistência\n` +
    `ℹ️ *lista_saida:* máximo 50 registros\n\n` +
    `${VERSAO_ADM}`
  )
}

// ============================================================
// EXPORT PRINCIPAL
// ============================================================

export function ehGrupoAdm(grupoId) {
  return String(grupoId || '') === GRUPO_ADM
}

export async function tratarComandoAdmin(sock, pool, grupoId, remetente, texto) {
  if (!ehGrupoAdm(grupoId)) return false

  // Trata estado de correção em andamento (não precisa validar admin novamente)
  if (estadosCorrecao.has(remetente)) {
    const admin = await validarAdmin(pool, remetente)
    if (admin) {
      return await tratarEstadoCorrecao(sock, pool, remetente, texto, admin.Nome)
    }
  }

  const txt = String(texto || '').trim().toLowerCase()

  // help
  if (txt === 'help') {
    await cmdHelp(sock)
    return true
  }

  // ver_saida_151 ou ver_saida_151_11 (limite padrão 5)
  const mVerSaida = txt.match(/^ver_saida_(\d+)(?:_([a-z0-9]+))?$/)
  if (mVerSaida) {
    const admin = await validarAdmin(pool, remetente)
    if (!admin) { await enviar(sock, `⛔ Sem permissão.`); return true }
    await cmdVerSaida(sock, pool, mVerSaida[1], mVerSaida[2] || null, 5)
    return true
  }

  // lista_saida_151_10 ou lista_saida_151_11_10 (limite parametrizado)
  const mListaSaida = txt.match(/^lista_saida_(\d+)(?:_([a-z0-9]+))?_(\d+)$/)
  if (mListaSaida) {
    const admin = await validarAdmin(pool, remetente)
    if (!admin) { await enviar(sock, `⛔ Sem permissão.`); return true }
    const limite = Number(mListaSaida[3])
    if (limite > 50) {
      await enviar(sock, `⚠️ Limite máximo: 50 registros`)
      return true
    }
    await cmdVerSaida(sock, pool, mListaSaida[1], mListaSaida[2] || null, limite)
    return true
  }

  // ver_colab
  if (txt === 'ver_colab') {
    const admin = await validarAdmin(pool, remetente)
    if (!admin) { await enviar(sock, `⛔ Sem permissão.`); return true }
    await cmdVerColab(sock, pool)
    return true
  }

  // ver_emb_151
  const mVerEmb = txt.match(/^ver_emb_(\d+)$/)
  if (mVerEmb) {
    const admin = await validarAdmin(pool, remetente)
    if (!admin) { await enviar(sock, `⛔ Sem permissão.`); return true }
    await cmdVerEmb(sock, pool, mVerEmb[1])
    return true
  }

  // corrigir_4521_S ou corrigir_4521_R
  const mCorrigir = txt.match(/^corrigir_(\d+)_(s|r)$/)
  if (mCorrigir) {
    const admin = await validarAdmin(pool, remetente)
    if (!admin) { await enviar(sock, `⛔ Sem permissão.`); return true }
    await cmdCorrigir(sock, pool, remetente, mCorrigir[1], mCorrigir[2].toUpperCase())
    return true
  }

  return false
}

// ============================================================
// ENVIO DE ALERTAS — chamado pelo hora_motor.js
// ============================================================

export async function alertarAdm(sock, mensagem) {
  await sock.sendMessage(GRUPO_ADM, { text: mensagem })
}
