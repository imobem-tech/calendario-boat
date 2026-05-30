// ============================================================
// wpp/grupos-admin.js — V.2605281314
// Allmax Gestão de Cotas
// 4 endpoints de gestão de grupos WhatsApp
//
// POST /grupos/renomear           — renomeia grupo pelo padrão
// POST /grupos/colaboradores/grupo — sync colaboradores num grupo
// POST /grupos/colaboradores/todos — sync colaboradores em todos os grupos
// POST /grupos/titular             — adiciona titular ao grupo
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

// ============================================================
// HELPERS COMUNS
// ============================================================

function normJid(jid) {
  return String(jid || '').replace(/@.*$/, '').replace(/:.*$/, '')
}

function montarNomeReduzidoCliente(nomeCliente) {
  const partes = String(nomeCliente || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (partes.length === 0) return ''
  const primeiroNome = partes[0].toUpperCase()
  if (partes.length === 1) return primeiroNome
  const inicialSegundoNome = partes[1].substring(0, 1).toUpperCase()
  return `${primeiroNome} ${inicialSegundoNome}`
}

function montarPrefixoGrupo(codEmbarcacao) {
  // Usa somente os 4 primeiros caracteres do identificador do grupo.
  // Ex.: PB 151 => "151-".
  const prefixo = `${String(codEmbarcacao || '').trim()}-`
  return prefixo.substring(0, 4)
}

function montarNomeGrupo(codEmbarcacao, gropoLetra, codCliente, plano, nomeCliente) {
  const unidade = String(plano || '').toLowerCase().includes('ctg') ? 'C' : 'G'
  const empresa  = Number(codCliente) === 4255 ? 'ALLMAX' : 'SUMMER'
  const nomeReduzido = montarNomeReduzidoCliente(nomeCliente)
  const prefixo = montarPrefixoGrupo(codEmbarcacao)
  const item = String(gropoLetra || '').trim()
  return `${prefixo}${item} _${unidade} ${empresa} (${nomeReduzido})`
}

async function atualizarGruposAgenda(pool, codEmbarcacao, gropoLetra, nomeGrupo, grupoId) {
  await pool.query(`
    INSERT INTO public.wpp_grupos_agenda (pb, cota, nomegrupowpp, grupowppid, dataatualizacao)
    VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'America/Sao_Paulo')
    ON CONFLICT (grupowppid) DO UPDATE
      SET pb = $1, cota = $2, nomegrupowpp = $3,
          dataatualizacao = NOW() AT TIME ZONE 'America/Sao_Paulo'
  `, [codEmbarcacao, String(gropoLetra), nomeGrupo, grupoId])
}

async function buscarColaboradoresAtivos(pool) {
  const { rows } = await pool.query(`
    SELECT "ID", "Nome", "Telefone", "Lid",
           COALESCE("Administrador", 'N') AS "Administrador",
           COALESCE("Ativo", 'S') AS "Ativo",
           "Local"
      FROM public.wpp_colaboradores
     WHERE "Telefone" IS NOT NULL AND TRIM("Telefone") <> ''
     ORDER BY "Nome"
  `)
  return rows
}

// Deriva unidade do grupo a partir do plano: 'ctg' no plano => 'C', caso contrário => 'G'
export function unidadeDoPlano(plano) {
  return String(plano || '').toLowerCase().slice(-3) === 'ctg' ? 'C' : 'G'
}

export function empresaDaLetra(letra) {
  return /^[a-zA-Z]/.test(String(letra || '').trim()) ? 'ALLMAX' : 'SUMMER'
}

// Verifica se o colaborador deve entrar no grupo conforme seu Local
// Retorna true se deve sincronizar, false se deve ser bloqueado/ignorado
function colaboradorPertenceAoLocal(colab, unidadeGrupo, addLog) {
  const local = String(colab.Local || '').trim().toUpperCase()
  if (!local) {
    addLog(`BLOQUEADO (Local não preenchido): ${colab.Nome}`)
    return false
  }
  if (local === 'T') return true
  if (local === unidadeGrupo) return true
  addLog(`SKIP (Local=${local} ≠ grupo ${unidadeGrupo}): ${colab.Nome}`)
  return false
}

// Resolve JID para adicionar ao grupo: sempre usa telefone via onWhatsApp
// Tenta com e sem nono dígito
async function resolverJidColaborador(sock, colab) {
  const tel = String(colab.Telefone || '').replace(/\D/g, '')
  if (!tel) return null

  const telComDDI = tel.startsWith('55') ? tel : '55' + tel
  const variantes = [telComDDI]
  if (telComDDI.length === 12) {
    variantes.push(telComDDI.slice(0, 4) + '9' + telComDDI.slice(4))
  } else if (telComDDI.length === 13) {
    variantes.push(telComDDI.slice(0, 4) + telComDDI.slice(5))
  }

  for (const variante of variantes) {
    try {
      const [res] = await sock.onWhatsApp(variante)
      if (res?.exists) return res.jid
    } catch {}
  }
  return null
}

// Grava Lid do colaborador na tabela quando descoberto
async function gravarLidColaborador(pool, colabId, lid, addLog) {
  if (!lid || !String(lid).includes('@lid')) return
  try {
    await pool.query(
      `UPDATE public.wpp_colaboradores SET "Lid" = $1 WHERE "ID" = $2`,
      [lid, colabId]
    )
    addLog(`Lid gravado para colaborador ID=${colabId}: ${lid}`)
  } catch (err) {
    addLog(`AVISO: falha ao gravar Lid: ${err.message}`)
  }
}

// Sincroniza colaboradores num único grupo
// unidadeGrupo: 'G' (Graciosa) ou 'C' (CTG) — derivado do plano
export async function sincronizarColaboradoresGrupo(sock, pool, grupoId, unidadeGrupo, addLog) {
  const colaboradores = await buscarColaboradoresAtivos(pool)

  // Busca participantes atuais do grupo
  let participantesAtuais = []
  try {
    const meta = await sock.groupMetadata(grupoId)
    participantesAtuais = meta.participants || []
  } catch (err) {
    addLog(`ERRO ao buscar participantes do grupo ${grupoId}: ${err.message}`)
    return { adicionados: 0, removidos: 0, promovidos: 0, rebaixados: 0, convites: 0, falhas: [] }
  }

  const jidsAtuais = participantesAtuais.map(p => ({
    jid: p.id,
    norm: normJid(p.id),
    isLid: String(p.id).includes('@lid'),
    admin: p.admin === 'admin' || p.admin === 'superadmin'
  }))

  // Resolve JIDs dos colaboradores via onWhatsApp (telefone)
  // Filtra por Local antes de qualquer resolução de JID
  const colaboradoresResolvidos = []
  for (const colab of colaboradores) {
    if (!colaboradorPertenceAoLocal(colab, unidadeGrupo, addLog)) continue
    const jid = await resolverJidColaborador(sock, colab)
    if (jid) {
      const normTel = normJid(jid)
      // Verifica se já está no grupo pelo Lid gravado ou pelo telefone normalizado
      const jaEstaNoGrupo = jidsAtuais.find(p =>
        (colab.Lid && p.norm === normJid(colab.Lid)) ||
        p.norm === normTel
      )
      colaboradoresResolvidos.push({
        ...colab,
        jidFinal: jid,
        normFinal: normTel,
        participanteAtual: jaEstaNoGrupo || null
      })
    } else {
      addLog(`AVISO: não resolveu JID para colaborador ${colab.Nome}`)
    }
  }

  // Separa ativos e inativos
  const ativos   = colaboradoresResolvidos.filter(c => c.Ativo === 'S')
  const inativos = colaboradoresResolvidos.filter(c => c.Ativo !== 'S')

  // Set de norms dos colaboradores ATIVOS (telefone + Lid)
  const normsColaboradores = new Set()
  for (const c of ativos) {
    normsColaboradores.add(c.normFinal)
    if (c.Lid) normsColaboradores.add(normJid(c.Lid))
  }

  // JIDs protegidos: ADM2
  const protegidos = new Set([normJid(ADM2_JID)])

  let adicionados = 0, removidos = 0, promovidos = 0, rebaixados = 0, convites = 0
  const falhas = []

  // Gera link de convite uma vez (reutilizado se necessário)
  let linkConvite = null
  async function obterLinkConvite() {
    if (linkConvite) return linkConvite
    try {
      const code = await sock.groupInviteCode(grupoId)
      linkConvite = `https://chat.whatsapp.com/${code}`
    } catch (err) {
      addLog(`AVISO: não foi possível gerar link de convite: ${err.message}`)
    }
    return linkConvite
  }

  // ADICIONAR / PROMOVER colaboradores ATIVOS
  for (const colab of ativos) {
    const jaEsta = colab.participanteAtual
    const deveSerAdmin = colab.Administrador === 'S'

    if (!jaEsta) {
      try {
        const resultado = await sock.groupParticipantsUpdate(grupoId, [colab.jidFinal], 'add')
        const status = String(resultado?.[0]?.status || '')

        // Grava Lid apenas se phone_number retornado bate com o colaborador
        const lidRetornado = resultado?.[0]?.jid
        const phoneRetornado = normJid(
          resultado?.[0]?.content?.attrs?.phone_number || ''
        )
        if (lidRetornado?.includes('@lid') && phoneRetornado) {
          const telColab = normJid(colab.jidFinal)
          if (phoneRetornado.slice(-8) === telColab.slice(-8)) {
            await gravarLidColaborador(pool, colab.ID, lidRetornado, addLog)
          } else {
            addLog(`AVISO: Lid não gravado — phone não bate (${phoneRetornado} ≠ ${telColab})`)
          }
        }

        if (status === '200') {
          try {
            const metaAtualizado = await sock.groupMetadata(grupoId)
            const telColab = normJid(colab.jidFinal)
            const participanteNovo = metaAtualizado.participants.find(p => {
              // Tenta match pelo phone_number se disponível, ou pelo JID s.whatsapp.net
              const pNorm = normJid(p.id)
              return pNorm === telColab || pNorm.slice(-8) === telColab.slice(-8)
            })
            if (participanteNovo?.id?.includes('@lid')) {
              await gravarLidColaborador(pool, colab.ID, participanteNovo.id, addLog)
            }
          } catch (errMeta) {
            addLog(`AVISO: não buscou Lid após add: ${errMeta.message}`)
          }

          if (deveSerAdmin) {
            try {
              await sock.groupParticipantsUpdate(grupoId, [colab.jidFinal], 'promote')
              addLog(`PROMOVIDO: ${colab.Nome}`)
              promovidos++
            } catch (errP) {
              addLog(`FALHA ao promover ${colab.Nome}: ${errP.message}`)
            }
          }
        } else if (status === '408') {
          const link = await obterLinkConvite()
          if (link) {
            const primeiroNome = String(colab.Nome || '').split(' ')[0]
            const msg =
              `Olá, *${primeiroNome}*! 👋\n\n` +
              `Você foi convidado para participar do grupo da embarcação.\n\n` +
              `Clique no link abaixo para entrar:\n${link}`
            try {
              await sock.sendMessage(colab.jidFinal, { text: msg })
              addLog(`CONVITE enviado no privado: ${colab.Nome}`)
              convites++
            } catch (errC) {
              addLog(`FALHA ao enviar convite ${colab.Nome}: ${errC.message}`)
              falhas.push({ nome: colab.Nome, erro: `convite: ${errC.message}` })
            }
          } else {
            addLog(`FALHA 408 sem link: ${colab.Nome}`)
            falhas.push({ nome: colab.Nome, erro: 'status 408 sem link de convite' })
          }
        } else {
          addLog(`FALHA ao adicionar ${colab.Nome}: status ${status}`)
          falhas.push({ nome: colab.Nome, erro: `status ${status}` })
        }
      } catch (err) {
        addLog(`FALHA ao adicionar ${colab.Nome}: ${err.message}`)
        falhas.push({ nome: colab.Nome, erro: err.message })
      }
    } else {
      // Já está — verifica se precisa promover/rebaixar
      if (deveSerAdmin && !jaEsta.admin) {
        try {
          await sock.groupParticipantsUpdate(grupoId, [jaEsta.jid], 'promote')
          addLog(`PROMOVIDO: ${colab.Nome}`)
          promovidos++
        } catch (err) {
          addLog(`FALHA ao promover ${colab.Nome}: ${err.message}`)
        }
      } else if (!deveSerAdmin && jaEsta.admin) {
        try {
          await sock.groupParticipantsUpdate(grupoId, [jaEsta.jid], 'demote')
          addLog(`REBAIXADO: ${colab.Nome}`)
          rebaixados++
        } catch (err) {
          addLog(`FALHA ao rebaixar ${colab.Nome}: ${err.message}`)
        }
      }
    }
  }

  // REMOVER colaboradores INATIVOS pelo Lid gravado
  // Usa TODOS os inativos independente do Local — remoção ignora Local
  const todosInativos = colaboradores.filter(c => (c.Ativo || 'S') !== 'S')
  for (const colab of todosInativos) {
    if (!colab.Lid) {
      addLog(`SKIP remoção ${colab.Nome}: sem Lid gravado`)
      continue
    }
    const normLid = normJid(colab.Lid)
    const noGrupo = jidsAtuais.find(p => p.norm === normLid)
    if (noGrupo) {
      try {
        await sock.groupParticipantsUpdate(grupoId, [noGrupo.jid], 'remove')
        addLog(`REMOVIDO (inativo): ${colab.Nome}`)
        removidos++
      } catch (err) {
        addLog(`FALHA ao remover inativo ${colab.Nome}: ${err.message}`)
        falhas.push({ nome: colab.Nome, erro: err.message })
      }
    } else {
      addLog(`OK: ${colab.Nome} (inativo) já não está no grupo`)
    }
  }

  // REMOVER participantes que eram colaboradores inativos sem Lid gravado
  // (fallback por telefone — filtra apenas inativos para não remover ativo com Local errado)
  for (const p of jidsAtuais) {
    if (protegidos.has(p.norm)) continue
    if (normsColaboradores.has(p.norm)) continue

    const normP = normJid(p.jid)
    const eraColabInativo = await pool.query(
      `SELECT 1 FROM public.wpp_colaboradores
        WHERE REPLACE(REPLACE(COALESCE("Telefone",''), '+', ''), ' ', '') LIKE $1
          AND COALESCE("Ativo", 'S') <> 'S'
        LIMIT 1`,
      ['%' + normP.slice(-8) + '%']
    )

    if (eraColabInativo.rowCount > 0) {
      try {
        await sock.groupParticipantsUpdate(grupoId, [p.jid], 'remove')
        addLog(`REMOVIDO (inativo sem Lid): ${p.jid}`)
        removidos++
      } catch (err) {
        addLog(`FALHA ao remover ${p.jid}: ${err.message}`)
        falhas.push({ jid: p.jid, erro: err.message })
      }
    }
  }

  return { adicionados, removidos, promovidos, rebaixados, convites, falhas }
}

// ============================================================
// ENDPOINT 1 — POST /grupos/renomear
// Body: { pb, letra }
// Busca grupo pelo prefixo do nome (primeiros 4 caracteres, ex.: "151-"), renomeia para padrão
// ============================================================
export async function handleRenomearGrupo(req, res, getSock, getConectado) {
  const sock = getSock()
  if (!getConectado() || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })

  const pb         = Number(req.body?.pb)
  const letra      = String(req.body?.letra       || '').trim()
  const codCliente = Number(req.body?.cod_cliente)
  const plano      = String(req.body?.plano        || '').trim()
  const nomeCliente = String(req.body?.nome_cliente || '').trim()

  if (!pb || !letra || !codCliente || !plano || !nomeCliente) {
    return res.status(400).json({ erro: 'Obrigatórios: pb, letra, cod_cliente, plano, nome_cliente' })
  }

  const log = []
  const addLog = msg => { console.log('[renomear]', msg); log.push(msg) }

  try {
    const nomeCorreto = montarNomeGrupo(pb, letra, codCliente, plano, nomeCliente)
    addLog(`Nome correto calculado: "${nomeCorreto}"`)

    // Busca grupos WPP considerando somente os primeiros 4 caracteres do nome atual.
    // Ex.: PB 151 => procura grupos cujo nome começa com "151-".
    const gruposWpp = await sock.groupFetchAllParticipating()
    const prefixoBusca = montarPrefixoGrupo(pb)
    const candidatos = Object.entries(gruposWpp)
      .map(([id, data]) => ({ id, subject: String(data.subject || '') }))
      .filter(g => g.subject.substring(0, 4) === prefixoBusca)

    addLog(`Candidatos encontrados: ${candidatos.length} (buscando prefixo "${prefixoBusca}")`)

    if (candidatos.length === 0) {
      return res.status(404).json({ erro: `Nenhum grupo encontrado começando com "${prefixoBusca}"`, log })
    }

    if (candidatos.length > 1) {
      return res.status(409).json({
        erro: `Múltiplos grupos encontrados (${candidatos.length}). Especifique melhor.`,
        candidatos: candidatos.map(g => ({ id: g.id, subject: g.subject })),
        log
      })
    }

    const grupo = candidatos[0]

    if (grupo.subject === nomeCorreto) {
      addLog(`Grupo já está com nome correto.`)
      await atualizarGruposAgenda(pool, pb, letra, nomeCorreto, grupo.id)
      return res.json({ acao: 'JA_OK', grupoId: grupo.id, nome: nomeCorreto, log })
    }

    addLog(`Renomeando "${grupo.subject}" → "${nomeCorreto}"`)
    await sock.groupUpdateSubject(grupo.id, nomeCorreto)
    await atualizarGruposAgenda(pool, pb, letra, nomeCorreto, grupo.id)

    return res.json({ acao: 'RENOMEADO', grupoId: grupo.id, de: grupo.subject, para: nomeCorreto, log })

  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    return res.status(500).json({ erro: err.message, log })
  }
}

// ============================================================
// ENDPOINT 2 — POST /grupos/colaboradores/grupo
// Body: { grupowppid }
// Sincroniza colaboradores num grupo específico
// ============================================================
export async function handleColaboradoresGrupo(req, res, getSock, getConectado) {
  const sock = getSock()
  if (!getConectado() || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })

  const grupowppid = String(req.body?.grupowppid || '').trim()
  if (!grupowppid) return res.status(400).json({ erro: 'grupowppid é obrigatório' })

  const log = []
  const addLog = msg => { console.log('[colab-grupo]', msg); log.push(msg) }

  try {
    addLog(`Sincronizando colaboradores no grupo ${grupowppid}`)

    // Busca plano do grupo para derivar unidade (G ou C)
    const rsPlano = await pool.query(`
      SELECT a."Plano"
        FROM public.wpp_grupos_agenda g
        JOIN public."P_BOAT_4_Autorizados" a
          ON a."Cod_Embarcacao" = g.pb
         AND UPPER(COALESCE(a."Gropo_letra",'')) = UPPER(COALESCE(g.cota,''))
       WHERE g.grupowppid = $1
         AND a."Dt_Desautorizacao" IS NULL
         AND a."Dt_Cancelamento"   IS NULL
       LIMIT 1
    `, [grupowppid])

    const plano = rsPlano.rows[0]?.Plano || ''
    const unidadeGrupo = unidadeDoPlano(plano)
    addLog(`Plano: "${plano}" → Unidade: ${unidadeGrupo}`)

    const resultado = await sincronizarColaboradoresGrupo(sock, pool, grupowppid, unidadeGrupo, addLog)
    return res.json({ sucesso: true, grupowppid, unidadeGrupo, ...resultado, log })
  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    return res.status(500).json({ erro: err.message, log })
  }
}

// ============================================================
// ENDPOINT 3 — POST /grupos/colaboradores/todos
// Sincroniza colaboradores em todos os grupos ativos
// (baseado em P_BOAT_4_Autorizados → wpp_grupos_agenda)
// ============================================================
export async function handleColaboradoresTodos(req, res, getSock, getConectado) {
  const sock = getSock()
  if (!getConectado() || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })

  const logGeral = []
  const addLog = msg => { console.log('[colab-todos]', msg); logGeral.push(msg) }

  try {
    // Busca pares pb+cota+plano ativos em P_BOAT_4_Autorizados
    const rsAtivos = await pool.query(`
      SELECT DISTINCT a."Cod_Embarcacao" AS pb,
                      a."Gropo_letra"    AS letra,
                      a."Plano"          AS plano
        FROM public."P_BOAT_4_Autorizados" a
       WHERE a."Dt_Desautorizacao" IS NULL
         AND a."Dt_Cancelamento"   IS NULL
       ORDER BY pb, letra
    `)

    const pares = rsAtivos.rows
    addLog(`Pares ativos encontrados: ${pares.length}`)

    const resultados = []

    for (const { pb, letra, plano } of pares) {
      // Busca grupowppid na wpp_grupos_agenda
      const rsGrupo = await pool.query(`
        SELECT grupowppid, nomegrupowpp
          FROM public.wpp_grupos_agenda
         WHERE pb = $1
           AND UPPER(COALESCE(cota, '')) = UPPER($2)
         LIMIT 1
      `, [pb, letra])

      if (rsGrupo.rowCount === 0) {
        addLog(`SKIP PB ${pb}/${letra}: sem grupo cadastrado em wpp_grupos_agenda`)
        resultados.push({ pb, letra, status: 'SEM_GRUPO' })
        continue
      }

      const grupowppid = rsGrupo.rows[0].grupowppid
      const nomeGrupo  = rsGrupo.rows[0].nomegrupowpp
      const unidadeGrupo = unidadeDoPlano(plano)
      addLog(`Processando PB ${pb}/${letra} — ${nomeGrupo} — Unidade: ${unidadeGrupo}`)

      const logGrupo = []
      try {
        const r = await sincronizarColaboradoresGrupo(sock, pool, grupowppid, unidadeGrupo, msg => logGrupo.push(msg))
        resultados.push({ pb, letra, nomeGrupo, grupowppid, status: 'OK', ...r, log: logGrupo })
      } catch (err) {
        addLog(`ERRO PB ${pb}/${letra}: ${err.message}`)
        resultados.push({ pb, letra, nomeGrupo, grupowppid, status: 'ERRO', erro: err.message, log: logGrupo })
      }
    }

    const totais = resultados.reduce((acc, r) => {
      acc.adicionados += r.adicionados || 0
      acc.removidos   += r.removidos   || 0
      acc.promovidos  += r.promovidos  || 0
      acc.rebaixados  += r.rebaixados  || 0
      return acc
    }, { adicionados: 0, removidos: 0, promovidos: 0, rebaixados: 0 })

    return res.json({ sucesso: true, totais, grupos: resultados, log: logGeral })

  } catch (err) {
    addLog(`ERRO GERAL: ${err.message}`)
    return res.status(500).json({ erro: err.message, log: logGeral })
  }
}

// ============================================================
// HELPER — cancelamento de grupo
// Remove todos exceto o bot e ADM2, depois re-adiciona e promove
// apenas os colaboradores administradores ativos do local do grupo
// ============================================================
export async function cancelarGrupo(sock, pool, grupowppid, unidadeGrupo, addLog) {
  // JID do próprio bot (si mesmo)
  const botJid = sock.user?.id
    ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
    : null

  const protegidos = new Set([normJid(ADM2_JID)])
  if (botJid) protegidos.add(normJid(botJid))

  // 1. Busca todos os participantes atuais
  const meta = await sock.groupMetadata(grupowppid)
  const participantes = meta.participants || []
  addLog(`Participantes encontrados: ${participantes.length}`)

  let removidos = 0
  const falhas = []

  // 2. Remove todos exceto protegidos
  // Admin precisa ser rebaixado antes de ser removido
  for (const p of participantes) {
    if (protegidos.has(normJid(p.id))) {
      addLog(`PROTEGIDO (mantido): ${p.id}`)
      continue
    }

    try {
      // Rebaixa admin antes de remover
      if (p.admin === 'admin' || p.admin === 'superadmin') {
        try {
          await sock.groupParticipantsUpdate(grupowppid, [p.id], 'demote')
          addLog(`REBAIXADO antes de remover: ${p.id}`)
        } catch (errD) {
          addLog(`AVISO rebaixar ${p.id}: ${errD.message}`)
        }
      }

      const resultado = await sock.groupParticipantsUpdate(grupowppid, [p.id], 'remove')
      const status = String(resultado?.[0]?.status ?? '200')

      if (status === '200') {
        addLog(`REMOVIDO: ${p.id}`)
        removidos++
      } else {
        addLog(`FALHA remover ${p.id}: status ${status}`)
        falhas.push({ jid: p.id, erro: `status ${status}` })
      }
    } catch (err) {
      addLog(`FALHA ao remover ${p.id}: ${err.message}`)
      falhas.push({ jid: p.id, erro: err.message })
    }
  }

  // 3. Re-adiciona apenas colaboradores administradores ativos do local
  const colaboradores = await buscarColaboradoresAtivos(pool)
  let adicionados = 0
  let promovidos = 0

  for (const colab of colaboradores) {
    if ((colab.Ativo || 'S') !== 'S') continue
    if (colab.Administrador !== 'S') continue
    if (!colaboradorPertenceAoLocal(colab, unidadeGrupo, addLog)) continue

    const jid = await resolverJidColaborador(sock, colab)
    if (!jid) {
      addLog(`AVISO: não resolveu JID para admin ${colab.Nome}`)
      continue
    }

    try {
      const resultado = await sock.groupParticipantsUpdate(grupowppid, [jid], 'add')
      const status = String(resultado?.[0]?.status || '')
      if (status === '200') {
        adicionados++
        addLog(`ADICIONADO (admin): ${colab.Nome}`)
        try {
          await sock.groupParticipantsUpdate(grupowppid, [jid], 'promote')
          promovidos++
          addLog(`PROMOVIDO: ${colab.Nome}`)
        } catch (errP) {
          addLog(`FALHA ao promover ${colab.Nome}: ${errP.message}`)
        }
      } else {
        addLog(`FALHA ao adicionar admin ${colab.Nome}: status ${status}`)
        falhas.push({ nome: colab.Nome, erro: `status ${status}` })
      }
    } catch (err) {
      addLog(`FALHA ao adicionar ${colab.Nome}: ${err.message}`)
      falhas.push({ nome: colab.Nome, erro: err.message })
    }
  }

  return { removidos, adicionados, promovidos, falhas }
}

// ============================================================
// HELPER — adiciona titular a um grupo (sem camada HTTP)
// Retorna { acao, nome, jid } — acao: ADICIONADO | JA_NO_GRUPO |
//   CONVITE_LINK_ENVIADO | CONVITE_FALHOU | BLOQUEADO | NAO_ENCONTRADO
// ============================================================
export async function adicionarTitularGrupo(sock, pool, grupowppid, codAutorizado, addLog) {
  const rsCliente = await pool.query(`
    SELECT c."Cliente_Nome" AS nome,
           c."Cliente_Telefone_Celular" AS telefone
      FROM public."P_BOAT_4_Autorizados" a
      JOIN public."Cliente" c ON c."Codigo" = a."Cod_Pessoa"
     WHERE a."Cod_Pessoa" = $1
       AND a."Dt_Desautorizacao" IS NULL
       AND a."Dt_Cancelamento"   IS NULL
       AND c."Cliente_Telefone_Celular" IS NOT NULL
     LIMIT 1
  `, [codAutorizado])

  if (rsCliente.rowCount === 0) {
    addLog(`Titular cod=${codAutorizado} não encontrado ou sem telefone`)
    return { acao: 'NAO_ENCONTRADO' }
  }

  const { nome, telefone } = rsCliente.rows[0]
  const tel = String(telefone).replace(/\D/g, '')
  const telComDDI = tel.startsWith('55') ? tel : '55' + tel

  addLog(`Titular: ${nome} | Tel: ${telefone} | Normalizado: ${telComDDI}`)

  const variantes = [telComDDI]
  if (telComDDI.length === 12) {
    variantes.push(telComDDI.slice(0, 4) + '9' + telComDDI.slice(4))
  } else if (telComDDI.length === 13) {
    variantes.push(telComDDI.slice(0, 4) + telComDDI.slice(5))
  }

  let jidTitular = null
  for (const variante of variantes) {
    try {
      const [res] = await sock.onWhatsApp(variante)
      if (res?.exists) { jidTitular = res.jid; break }
    } catch {}
  }

  if (!jidTitular) {
    addLog(`Número ${telefone} não encontrado no WhatsApp`)
    return { acao: 'NAO_ENCONTRADO', nome }
  }
  addLog(`JID resolvido: ${jidTitular}`)

  const meta = await sock.groupMetadata(grupowppid)
  const jaEsta = meta.participants.some(p => normJid(p.id) === normJid(jidTitular))
  if (jaEsta) {
    addLog(`Titular já está no grupo.`)
    return { acao: 'JA_NO_GRUPO', nome, jid: jidTitular }
  }

  const resultado = await sock.groupParticipantsUpdate(grupowppid, [jidTitular], 'add')
  addLog(`groupParticipantsUpdate: ${JSON.stringify(resultado)}`)
  const status = String(resultado?.[0]?.status || '')

  if (status === '200') {
    addLog(`Titular adicionado: ${nome}`)
    return { acao: 'ADICIONADO', nome, jid: jidTitular }
  }

  if (status === '408') {
    try {
      const linkCode = await sock.groupInviteCode(grupowppid)
      const msgConvite =
        `Olá, *${nome.split(' ')[0]}*! 👋\n\n` +
        `Você foi convidado para participar do grupo da sua embarcação.\n\n` +
        `Clique no link abaixo para entrar:\n` +
        `https://chat.whatsapp.com/${linkCode}`
      await sock.sendMessage(jidTitular, { text: msgConvite })
      addLog(`Convite enviado no privado de ${nome}`)
      return { acao: 'CONVITE_LINK_ENVIADO', nome, jid: jidTitular }
    } catch (errLink) {
      addLog(`Falha ao enviar convite: ${errLink.message}`)
      return { acao: 'CONVITE_FALHOU', nome, jid: jidTitular, erro: errLink.message }
    }
  }

  if (status === '403') {
    addLog(`Titular bloqueou adições: ${nome}`)
    return { acao: 'BLOQUEADO', nome, jid: jidTitular }
  }

  addLog(`Status inesperado: ${status}`)
  return { acao: 'RESULTADO_INESPERADO', nome, jid: jidTitular, status }
}

// ============================================================
// ENDPOINT 4 — POST /grupos/titular
// Body: { grupowppid, cod_autorizado }
// ============================================================
export async function handleAdicionarTitular(req, res, getSock, getConectado) {
  const sock = getSock()
  if (!getConectado() || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })

  const grupowppid    = String(req.body?.grupowppid    || '').trim()
  const codAutorizado = Number(req.body?.cod_autorizado)

  if (!grupowppid || !codAutorizado) {
    return res.status(400).json({ erro: 'grupowppid e cod_autorizado são obrigatórios' })
  }

  const log = []
  const addLog = msg => { console.log('[titular]', msg); log.push(msg) }

  try {
    const resultado = await adicionarTitularGrupo(sock, pool, grupowppid, codAutorizado, addLog)
    return res.json({ ...resultado, log })
  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    return res.status(500).json({ erro: err.message, log })
  }
}
