// ============================================================
// wpp/renomear-grupos.js — V.2605310300
// Endpoint principal: POST /grupos/alterar
//
// Regra:
//   0 registros em wpp_grupos_agenda para PB+COTA => cria grupo novo e grava ID
//   1 registro  => usa o grupowppid existente como oficial
//   2+ registros => envia teste para todos e aguarda confirmação manual
//
// Importante:
//   - NUNCA localiza grupo por nome/subject.
//   - O nome do grupo serve apenas para padronização visual.
//   - O ID definitivo é sempre public.wpp_grupos_agenda.grupowppid.
//   - Antes de alterar nome/membros/permissões, o bot precisa ser administrador.
//   - ATIVO: sincroniza colaboradores C/G/T + cliente/autorizado sem admin.
//   - SUSPENSO: remove todos exceto bot e recoloca só colaboradores admins C/G/T.
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

import {
  adicionarTitularGrupo,
  unidadeDoPlano,
  empresaDaLetra
} from './grupos-admin.js'

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function normalizarCota(cota) {
  return String(cota || '').trim().toUpperCase()
}

function normalizarTelefoneParaJid(telefone) {
  const digits = String(telefone || '').replace(/\D/g, '')
  if (!digits) return null
  return `${digits}@s.whatsapp.net`
}

function normalizarBotId(sock) {
  const raw = sock?.user?.id || sock?.user?.jid || ''
  const numero = String(raw).split(':')[0].replace(/\D/g, '')
  return numero ? `${numero}@s.whatsapp.net` : null
}

function abreviarNome(nomeCompleto) {
  const partes = String(nomeCompleto || '').trim().toUpperCase().split(/\s+/)
  if (partes.length <= 1) return partes[0] || ''
  return `${partes[0]} ${partes[1][0]}`
}

function montarNomeGrupoPadrao(pb, cota, plano, nomeCliente) {
  const unidade = unidadeDoPlano(plano)
  const empresa = empresaDaLetra(cota)
  const abrev = abreviarNome(nomeCliente)
  return `${pb}-${normalizarCota(cota)} _${unidade} ${empresa} (${abrev})`
}

function dataBR(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function montarNomeGrupoSuspenso(pb, cota, plano, nomeCliente) {
  return `${montarNomeGrupoPadrao(pb, cota, plano, nomeCliente)} Susp_${dataBR()}`
}

function isPlanoSuspenso(plano) {
  const p = String(plano || '').trim().toLowerCase()
  return p === 'suspenso' || p === 'suspensa' || p === 'cancelado' || p === 'cancelada'
}

function unidadePermitida(unidade) {
  return ['C', 'G', 'T'].includes(String(unidade || '').trim().toUpperCase())
}

function codigoConfirmacaoGrupoCerto(pb, cota) {
  return `${pb}-${normalizarCota(cota)}#grupocerto`
}

function validarGrupoId(grupoId) {
  return typeof grupoId === 'string' && grupoId.endsWith('@g.us')
}

// ------------------------------------------------------------
// Banco: agenda de grupos
// ------------------------------------------------------------
async function buscarRegistrosAgenda(pb, cota) {
  const rs = await pool.query(
    `SELECT id, pb, cota, grupowppid, nomegrupowpp
       FROM public.wpp_grupos_agenda
      WHERE pb = $1
        AND UPPER(COALESCE(cota, '')) = UPPER($2)
      ORDER BY id`,
    [pb, normalizarCota(cota)]
  )

  return rs.rows
}

async function inserirGrupoAgenda(pb, cota, grupoId, nomeGrupo) {
  const rs = await pool.query(
    `INSERT INTO public.wpp_grupos_agenda
        (pb, cota, grupowppid, nomegrupowpp, dataatualizacao)
     VALUES
        ($1, $2, $3, $4, NOW() AT TIME ZONE 'America/Sao_Paulo')
     RETURNING id, pb, cota, grupowppid, nomegrupowpp`,
    [pb, normalizarCota(cota), grupoId, nomeGrupo]
  )

  return rs.rows[0]
}

async function atualizarNomeAgenda(grupoId, nomeGrupo) {
  await pool.query(
    `UPDATE public.wpp_grupos_agenda
        SET nomegrupowpp = $1,
            dataatualizacao = NOW() AT TIME ZONE 'America/Sao_Paulo'
      WHERE grupowppid = $2`,
    [nomeGrupo, grupoId]
  )
}

async function removerRegistrosDuplicados(pb, cota, grupoIdOficial) {
  await pool.query(
    `DELETE FROM public.wpp_grupos_agenda
      WHERE pb = $1
        AND UPPER(COALESCE(cota, '')) = UPPER($2)
        AND grupowppid <> $3`,
    [pb, normalizarCota(cota), grupoIdOficial]
  )
}

// ------------------------------------------------------------
// Banco: colaboradores
// AJUSTAR AQUI se os nomes reais forem diferentes.
// Retorno esperado:
//   jid     = '55...@s.whatsapp.net'
//   ativo   = true/false
//   admin   = true/false
//   unidade = C/G/T
// ------------------------------------------------------------
async function buscarColaboradoresCadastro(unidadeGrupo) {
  const unidade = String(unidadeGrupo || '').trim().toUpperCase()

  if (!unidadePermitida(unidade)) {
    throw new Error(`Unidade inválida para sincronização: ${unidadeGrupo}`)
  }

  const rs = await pool.query(
    `SELECT DISTINCT
        REPLACE(c."Cliente_Telefone_Celular", '+', '') || '@s.whatsapp.net' AS jid,
        COALESCE(c."Ativo", true) AS ativo,
        COALESCE(c."Administrador", false) AS admin,
        UPPER(COALESCE(c."Unidade", '')) AS unidade
       FROM public."Cliente" c
      WHERE c."Cliente_Telefone_Celular" IS NOT NULL
        AND UPPER(COALESCE(c."Unidade", '')) = UPPER($1)`,
    [unidade]
  )

  return rs.rows
    .map(r => ({
      jid: r.jid,
      ativo: !!r.ativo,
      admin: !!r.admin,
      unidade: String(r.unidade || '').toUpperCase()
    }))
    .filter(r => r.jid && unidadePermitida(r.unidade))
}

// ------------------------------------------------------------
// WhatsApp base
// ------------------------------------------------------------
async function enviarMensagem(sock, grupoId, texto) {
  await sock.sendMessage(grupoId, { text: texto })
}

async function obterParticipantesGrupo(sock, grupoId) {
  const metadata = await sock.groupMetadata(grupoId)
  return (metadata?.participants || []).map(p => ({
    id: p.id,
    admin: p.admin || null
  }))
}

async function garantirBotAdministrador(sock, grupoId) {
  const botId = normalizarBotId(sock)

  if (!botId) {
    throw new Error('Não foi possível identificar o JID do bot conectado')
  }

  const participantes = await obterParticipantesGrupo(sock, grupoId)
  const bot = participantes.find(p => p.id === botId)

  if (!bot) {
    throw new Error(`Bot não está no grupo ${grupoId}`)
  }

  if (!bot.admin) {
    throw new Error(
      `Bot não é administrador no grupo ${grupoId}. ` +
      `Não é possível alterar nome, remover, adicionar, promover ou rebaixar participantes.`
    )
  }

  return { botId, participantes }
}

async function renomearGrupo(sock, grupoId, nomeGrupo, addLog) {
  await sock.groupUpdateSubject(grupoId, nomeGrupo)
  await atualizarNomeAgenda(grupoId, nomeGrupo)
  addLog(`Nome atualizado: ${nomeGrupo}`)
}

async function criarGrupoNovo(sock, pb, cota, nomePadrao, jidTitular, addLog) {
  const membros = [jidTitular, ADM2_JID].filter(Boolean)

  if (membros.length === 0) {
    throw new Error('Não foi possível criar grupo: nenhum membro válido informado')
  }

  const criado = await sock.groupCreate(nomePadrao, membros)
  const grupoId = criado?.id

  if (!validarGrupoId(grupoId)) {
    throw new Error(`WhatsApp não retornou um grupowppid válido: ${grupoId || 'vazio'}`)
  }

  try {
    await sock.groupParticipantsUpdate(grupoId, [ADM2_JID], 'promote')
  } catch (err) {
    addLog(`AVISO admin ADM2: ${err.message}`)
  }

  const registro = await inserirGrupoAgenda(pb, cota, grupoId, nomePadrao)
  addLog(`Grupo criado e gravado: ${grupoId}`)

  return registro
}

async function enviarTesteDuplicados(sock, pb, cota, registros, addLog) {
  const codigo = codigoConfirmacaoGrupoCerto(pb, cota)

  const texto =
    `VALIDAÇÃO DE GRUPO\n\n` +
    `PB/COTA: ${pb}-${normalizarCota(cota)}\n\n` +
    `Este PB/COTA possui mais de um grupo cadastrado.\n` +
    `Para confirmar ESTE grupo como o oficial, responda exatamente:\n\n` +
    `${codigo}`

  for (const reg of registros) {
    if (!validarGrupoId(reg.grupowppid)) {
      addLog(`SKIP teste duplicado: ID inválido no registro ${reg.id}`)
      continue
    }

    try {
      await enviarMensagem(sock, reg.grupowppid, texto)
      addLog(`Mensagem de validação enviada para ${reg.grupowppid}`)
    } catch (err) {
      addLog(`ERRO ao enviar validação para ${reg.grupowppid}: ${err.message}`)
    }
  }

  return codigo
}

// ------------------------------------------------------------
// Sincronização ATIVA
// ------------------------------------------------------------
async function sincronizarGrupoAtivo(sock, grupoId, unidadeGrupo, botId, codCliente, addLog) {
  const cadastro = await buscarColaboradoresCadastro(unidadeGrupo)

  const participantes = await obterParticipantesGrupo(sock, grupoId)
  const participantesSet = new Set(participantes.map(p => p.id))

  const colaboradoresAtivos = cadastro.filter(c => c.ativo)
  const colaboradoresInativos = cadastro.filter(c => !c.ativo)

  const inativosNoGrupo = colaboradoresInativos
    .map(c => c.jid)
    .filter(jid => jid !== botId && participantesSet.has(jid))

  if (inativosNoGrupo.length > 0) {
    await sock.groupParticipantsUpdate(grupoId, inativosNoGrupo, 'remove')
    addLog(`Ativo: removidos ${inativosNoGrupo.length} colaboradores inativos`)
  } else {
    addLog('Ativo: nenhum colaborador inativo para remover')
  }

  const ativosForaGrupo = colaboradoresAtivos
    .map(c => c.jid)
    .filter(jid => jid !== botId && !participantesSet.has(jid))

  if (ativosForaGrupo.length > 0) {
    await sock.groupParticipantsUpdate(grupoId, ativosForaGrupo, 'add')
    addLog(`Ativo: adicionados ${ativosForaGrupo.length} colaboradores ativos da unidade ${unidadeGrupo}`)
  } else {
    addLog('Ativo: nenhum colaborador ativo novo para adicionar')
  }

  const participantesAtualizados = await obterParticipantesGrupo(sock, grupoId)
  const atualizadosMap = new Map(participantesAtualizados.map(p => [p.id, p]))

  const promover = colaboradoresAtivos
    .filter(c => c.admin && c.jid !== botId)
    .map(c => c.jid)
    .filter(jid => atualizadosMap.has(jid) && !atualizadosMap.get(jid).admin)

  const rebaixar = colaboradoresAtivos
    .filter(c => !c.admin && c.jid !== botId)
    .map(c => c.jid)
    .filter(jid => atualizadosMap.has(jid) && atualizadosMap.get(jid).admin)

  if (promover.length > 0) {
    await sock.groupParticipantsUpdate(grupoId, promover, 'promote')
    addLog(`Ativo: promovidos ${promover.length} colaboradores conforme cadastro`)
  } else {
    addLog('Ativo: nenhum colaborador para promover')
  }

  if (rebaixar.length > 0) {
    await sock.groupParticipantsUpdate(grupoId, rebaixar, 'demote')
    addLog(`Ativo: rebaixados ${rebaixar.length} colaboradores conforme cadastro`)
  } else {
    addLog('Ativo: nenhum colaborador para rebaixar')
  }

  let titular = {}

  try {
    titular = await adicionarTitularGrupo(sock, pool, grupoId, codCliente, addLog)

    if (titular?.jid) {
      const ps = await obterParticipantesGrupo(sock, grupoId)
      const pTitular = ps.find(p => p.id === titular.jid)

      if (pTitular?.admin) {
        await sock.groupParticipantsUpdate(grupoId, [titular.jid], 'demote')
        addLog('Ativo: cliente/autorizado rebaixado para participante comum')
      }
    }
  } catch (err) {
    addLog(`AVISO titular: ${err.message}`)
    titular = { acao: 'ERRO', erro: err.message }
  }

  return {
    unidadeGrupo,
    colaboradores_ativos_cadastro: colaboradoresAtivos.length,
    colaboradores_inativos_removidos: inativosNoGrupo.length,
    colaboradores_ativos_adicionados: ativosForaGrupo.length,
    promovidos: promover.length,
    rebaixados: rebaixar.length,
    titular
  }
}

// ------------------------------------------------------------
// Sincronização SUSPENSA
// ------------------------------------------------------------
async function removerTodosExcetoBot(sock, grupoId, botId, addLog) {
  const participantes = await obterParticipantesGrupo(sock, grupoId)

  const remover = participantes
    .map(p => p.id)
    .filter(jid => jid && jid !== botId)

  if (remover.length === 0) {
    addLog('Suspensão: nenhum participante para remover')
    return { removidos: 0, botId }
  }

  await sock.groupParticipantsUpdate(grupoId, remover, 'remove')
  addLog(`Suspensão: removidos ${remover.length} participantes; bot mantido no grupo`)

  return { removidos: remover.length, botId }
}

async function suspenderGrupo(sock, grupoId, unidadeGrupo, botId, addLog) {
  const limpeza = await removerTodosExcetoBot(sock, grupoId, botId, addLog)
  const cadastro = await buscarColaboradoresCadastro(unidadeGrupo)

  const adminsAtivos = cadastro.filter(c => c.ativo && c.admin && c.jid !== botId)
  const jidsAdmins = adminsAtivos.map(c => c.jid)

  if (jidsAdmins.length > 0) {
    await sock.groupParticipantsUpdate(grupoId, jidsAdmins, 'add')
    addLog(`Suspensão: recolocados ${jidsAdmins.length} colaboradores administradores ativos da unidade ${unidadeGrupo}`)

    try {
      await sock.groupParticipantsUpdate(grupoId, jidsAdmins, 'promote')
      addLog('Suspensão: colaboradores recolocados promovidos a administradores')
    } catch (err) {
      addLog(`AVISO suspensão/promote: ${err.message}`)
    }
  } else {
    addLog(`Suspensão: nenhum colaborador administrador ativo encontrado para unidade ${unidadeGrupo}`)
  }

  return {
    acao: 'SUSPENSO',
    limpeza,
    colaboradores_admins_recolocados: jidsAdmins.length,
    unidadeGrupo
  }
}

// ============================================================
// POST /grupos/alterar
// Body esperado:
// {
//   pb,
//   cota,
//   cod_cliente,
//   plano,
//   nome_cliente,
//   telefone_cliente
// }
// ============================================================
export async function handleAlterarGrupo(req, res, getSock, getConectado) {
  const sock = getSock()
  const conectado = getConectado()
  const log = []
  const addLog = msg => { console.log('[grupos/alterar]', msg); log.push(msg) }

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' })
  }

  const {
    pb,
    cota,
    cod_cliente,
    plano,
    nome_cliente,
    telefone_cliente
  } = req.body

  if (!pb || !cota || !cod_cliente || !plano || !nome_cliente) {
    return res.status(400).json({
      erro: 'Campos obrigatórios: pb, cota, cod_cliente, plano, nome_cliente'
    })
  }

  const cotaNorm = normalizarCota(cota)
  const unidadeGrupo = unidadeDoPlano(plano)
  const nomePadrao = montarNomeGrupoPadrao(pb, cotaNorm, plano, nome_cliente)

  try {
    const registros = await buscarRegistrosAgenda(pb, cotaNorm)

    let grupoId
    let origemGrupo

    if (registros.length === 0) {
      const jidTitular = normalizarTelefoneParaJid(telefone_cliente)
      const novoRegistro = await criarGrupoNovo(sock, pb, cotaNorm, nomePadrao, jidTitular, addLog)

      grupoId = novoRegistro.grupowppid
      origemGrupo = 'CRIADO'
    } else if (registros.length === 1) {
      const reg = registros[0]

      if (!validarGrupoId(reg.grupowppid)) {
        return res.status(422).json({
          erro: `Registro encontrado, mas grupowppid inválido para pb=${pb} cota=${cotaNorm}`,
          registro: reg,
          log
        })
      }

      grupoId = reg.grupowppid
      origemGrupo = 'EXISTENTE_UNICO'
      addLog(`Grupo oficial encontrado: ${grupoId}`)
    } else {
      const codigo = await enviarTesteDuplicados(sock, pb, cotaNorm, registros, addLog)

      return res.status(409).json({
        erro: `Existem ${registros.length} grupos cadastrados para pb=${pb} cota=${cotaNorm}. Confirme o grupo oficial pelo WhatsApp.`,
        acao: 'AGUARDANDO_CONFIRMACAO_GRUPO_CORRETO',
        codigo_confirmacao: codigo,
        registros,
        log
      })
    }

    const { botId } = await garantirBotAdministrador(sock, grupoId)
    addLog(`Bot confirmado como administrador: ${botId}`)

    if (isPlanoSuspenso(plano)) {
      const nomeSuspenso = montarNomeGrupoSuspenso(pb, cotaNorm, plano, nome_cliente)

      await renomearGrupo(sock, grupoId, nomeSuspenso, addLog)

      const suspensao = await suspenderGrupo(sock, grupoId, unidadeGrupo, botId, addLog)

      return res.json({
        sucesso: true,
        acao: 'SUSPENSO',
        origemGrupo,
        grupoId,
        nomeGrupo: nomeSuspenso,
        suspensao,
        log
      })
    }

    await renomearGrupo(sock, grupoId, nomePadrao, addLog)

    const ativo = await sincronizarGrupoAtivo(
      sock,
      grupoId,
      unidadeGrupo,
      botId,
      cod_cliente,
      addLog
    )

    return res.json({
      sucesso: true,
      acao: 'ALTERADO',
      origemGrupo,
      grupoId,
      nomeGrupo: nomePadrao,
      ativo,
      log
    })

  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    console.error('[grupos/alterar] ERRO:', err)
    return res.status(500).json({ erro: err.message, log })
  }
}

// ============================================================
// Handler para confirmação via mensagem recebida
// Uso esperado no server.js:
//   await tratarConfirmacaoGrupoCerto(sock, msg)
// ============================================================
export async function tratarConfirmacaoGrupoCerto(sock, msg) {
  const remoteJid = msg?.key?.remoteJid
  if (!validarGrupoId(remoteJid)) return null

  const texto =
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    ''

  const match = String(texto).trim().toUpperCase().match(/^(\d+)-([A-Z0-9]+)#GRUPOCERTO$/)

  if (!match) return null

  const pb = parseInt(match[1], 10)
  const cota = normalizarCota(match[2])
  const grupoIdOficial = remoteJid

  const registros = await buscarRegistrosAgenda(pb, cota)

  if (registros.length <= 1) {
    return {
      tratado: false,
      motivo: 'Não existem duplicados para saneamento',
      pb,
      cota,
      grupoIdOficial
    }
  }

  const existeNaTabela = registros.some(r => r.grupowppid === grupoIdOficial)

  if (!existeNaTabela) {
    return {
      tratado: false,
      motivo: 'Grupo que respondeu não está cadastrado entre os duplicados',
      pb,
      cota,
      grupoIdOficial
    }
  }

  const excedentes = registros.filter(r => r.grupowppid !== grupoIdOficial)

  for (const reg of excedentes) {
    try {
      await sock.groupLeave(reg.grupowppid)
    } catch (err) {
      console.warn(`[grupo-certo] Erro ao sair do grupo excedente ${reg.grupowppid}:`, err.message)
    }
  }

  await removerRegistrosDuplicados(pb, cota, grupoIdOficial)

  return {
    tratado: true,
    pb,
    cota,
    grupoIdOficial,
    removidos: excedentes.map(r => ({
      id: r.id,
      grupowppid: r.grupowppid
    }))
  }
}
