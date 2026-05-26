// ============================================================
// wpp/grupos-admin.js — Allmax®2605261640
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

function montarNomeGrupo(codEmbarcacao, gropoLetra, codCliente, plano, nomeCliente) {
  const unidade = String(plano || '').toLowerCase().includes('ctg') ? 'C' : 'G'
  const empresa  = Number(codCliente) === 4255 ? 'ALLMAX' : 'SUMMER'
  const nomeReduzido = montarNomeReduzidoCliente(nomeCliente)
  return `${codEmbarcacao}-${gropoLetra} _${unidade} ${empresa} (${nomeReduzido})`
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
           COALESCE("Ativo", 'S') AS "Ativo"
      FROM public.wpp_colaboradores
     WHERE "Telefone" IS NOT NULL AND TRIM("Telefone") <> ''
     ORDER BY "Nome"
  `)
  return rows
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
async function sincronizarColaboradoresGrupo(sock, pool, grupoId, addLog) {
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
  const colaboradoresResolvidos = []
  for (const colab of colaboradores) {
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
  for (const colab of inativos) {
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

  // REMOVER participantes que eram colaboradores ativos mas foram desativados
  // (fallback: identifica pelo telefone normalizado caso Lid não gravado)
  for (const p of jidsAtuais) {
    if (protegidos.has(p.norm)) continue
    if (normsColaboradores.has(p.norm)) continue

    // Verifica se esse JID pertencia a um colaborador (pelo telefone normalizado)
    const normP = normJid(p.jid)
    const eraColab = await pool.query(
      `SELECT 1 FROM public.wpp_colaboradores
        WHERE REPLACE(REPLACE(COALESCE("Telefone",''), '+', ''), ' ', '') LIKE $1
        LIMIT 1`,
      ['%' + normP.slice(-8) + '%']
    )

    if (eraColab.rowCount > 0) {
      try {
        await sock.groupParticipantsUpdate(grupoId, [p.jid], 'remove')
        addLog(`REMOVIDO (inativo): ${p.jid}`)
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
// Busca grupo pelo nome (contém "{pb}-{letra}"), renomeia para padrão
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

    // Busca grupos WPP que contêm "{pb}-{letra}" no nome
    const gruposWpp = await sock.groupFetchAllParticipating()
    const trecho = `${pb}-${letra}`
    const candidatos = Object.entries(gruposWpp)
      .map(([id, data]) => ({ id, subject: data.subject }))
      .filter(g => g.subject.includes(trecho))

    addLog(`Candidatos encontrados: ${candidatos.length} (buscando "${trecho}")`)

    if (candidatos.length === 0) {
      return res.status(404).json({ erro: `Nenhum grupo encontrado contendo "${trecho}"`, log })
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
    const resultado = await sincronizarColaboradoresGrupo(sock, pool, grupowppid, addLog)
    return res.json({ sucesso: true, grupowppid, ...resultado, log })
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
    // Busca pares pb+cota ativos em P_BOAT_4_Autorizados
    const rsAtivos = await pool.query(`
      SELECT DISTINCT a."Cod_Embarcacao" AS pb,
                      a."Gropo_letra"    AS letra
        FROM public."P_BOAT_4_Autorizados" a
       WHERE a."Dt_Desautorizacao" IS NULL
         AND a."Dt_Cancelamento"   IS NULL
       ORDER BY pb, letra
    `)

    const pares = rsAtivos.rows
    addLog(`Pares ativos encontrados: ${pares.length}`)

    const resultados = []

    for (const { pb, letra } of pares) {
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
      addLog(`Processando PB ${pb}/${letra} — ${nomeGrupo}`)

      const logGrupo = []
      try {
        const r = await sincronizarColaboradoresGrupo(sock, pool, grupowppid, msg => logGrupo.push(msg))
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
// ENDPOINT 4 — POST /grupos/titular
// Body: { grupowppid, cod_autorizado }
// Adiciona o titular ao grupo como membro simples
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
    // Busca telefone do autorizado
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
      return res.status(404).json({ erro: `Autorizado ${codAutorizado} não encontrado ou sem telefone`, log })
    }

    const { nome, telefone } = rsCliente.rows[0]
    const tel = String(telefone).replace(/\D/g, '')
    // Garante DDI 55
    const telComDDI = tel.startsWith('55') ? tel : '55' + tel

    addLog(`Titular: ${nome} | Tel: ${telefone} | Normalizado: ${telComDDI}`)

    // Tenta com nono dígito e sem nono dígito
    const variantes = [telComDDI]
    if (telComDDI.length === 12) {
      // sem nono → adiciona nono: 556384030406 → 5563984030406
      variantes.push(telComDDI.slice(0, 4) + '9' + telComDDI.slice(4))
    } else if (telComDDI.length === 13) {
      // com nono → remove nono: 5563984030406 → 556384030406
      variantes.push(telComDDI.slice(0, 4) + telComDDI.slice(5))
    }

    let jidTitular = null
    for (const variante of variantes) {
      try {
        const [resultado] = await sock.onWhatsApp(variante)
        if (resultado?.exists) {
          jidTitular = resultado.jid
          addLog(`JID resolvido via ${variante}: ${jidTitular}`)
          break
        }
      } catch {}
    }

    if (!jidTitular) {
      return res.status(404).json({ erro: `Número ${telefone} não encontrado no WhatsApp`, log })
    }

    // Verifica se já está no grupo
    const meta = await sock.groupMetadata(grupowppid)
    const jaEsta = meta.participants.some(p => normJid(p.id) === normJid(jidTitular))

    if (jaEsta) {
      addLog(`Titular já está no grupo.`)
      return res.json({ acao: 'JA_NO_GRUPO', nome, jid: jidTitular, log })
    }

    const resultado = await sock.groupParticipantsUpdate(grupowppid, [jidTitular], 'add')
    addLog(`Resultado groupParticipantsUpdate: ${JSON.stringify(resultado)}`)

    const status = String(resultado?.[0]?.status || '')

    if (status === '200') {
      addLog(`Titular adicionado diretamente: ${nome}`)
      return res.json({ acao: 'ADICIONADO', nome, jid: jidTitular, log })
    }

    if (status === '408') {
      // Privacidade bloqueou adição direta — envia link de convite no privado
      try {
        const linkCode = await sock.groupInviteCode(grupowppid)
        const msgConvite =
          `Olá, *${nome.split(' ')[0]}*! 👋\n\n` +
          `Você foi convidado para participar do grupo da sua embarcação.\n\n` +
          `Clique no link abaixo para entrar:\n` +
          `https://chat.whatsapp.com/${linkCode}`
        await sock.sendMessage(jidTitular, { text: msgConvite })
        addLog(`Link de convite enviado no privado de ${nome}: ${jidTitular}`)
        return res.json({ acao: 'CONVITE_LINK_ENVIADO', nome, jid: jidTitular, log })
      } catch (errLink) {
        addLog(`Falha ao gerar/enviar link de convite: ${errLink.message}`)
        return res.json({ acao: 'CONVITE_FALHOU', nome, jid: jidTitular, erro: errLink.message, log })
      }
    }

    if (status === '403') {
      addLog(`Titular bloqueou adições: ${nome}`)
      return res.json({ acao: 'BLOQUEADO', nome, jid: jidTitular, log })
    }

    addLog(`Status inesperado: ${status}`)
    return res.json({ acao: 'RESULTADO_INESPERADO', nome, jid: jidTitular, status, log })

  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    return res.status(500).json({ erro: err.message, log })
  }
}
