// ============================================================
// wpp/criar-ou-atualizar-grupo.js
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

function montarNomeReduzidoCliente(nomeCliente) {
  const partes = String(nomeCliente || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)

  if (partes.length === 0) return ''

  const primeiroNome = partes[0].toUpperCase()

  if (partes.length === 1) return primeiroNome

  const inicialSegundoNome = partes[1].substring(0, 1).toUpperCase()

  return `${primeiroNome} ${inicialSegundoNome}`
}

function montarNomeGrupo(codEmbarcacao, gropoLetra, codCliente, plano, nomeCliente) {
  const unidade = String(plano || '').toLowerCase().includes('ctg') ? 'C' : 'G'
  const empresa = Number(codCliente) === 4255 ? 'ALLMAX' : 'SUMMER'
  const nomeReduzido = montarNomeReduzidoCliente(nomeCliente)

  return `${codEmbarcacao}-${gropoLetra} _${unidade} ${empresa} (${nomeReduzido})`
}

async function buscarDadosDono(codPessoa) {
  const { rows } = await pool.query(`
    SELECT
      REPLACE("Cliente_Telefone_Celular", '+', '') || '@s.whatsapp.net' AS jid_dono,
      "Cliente_Nome" AS nome_cliente
    FROM public."Cliente"
    WHERE "Codigo" = $1
      AND "Cliente_Telefone_Celular" IS NOT NULL
    LIMIT 1
  `, [codPessoa])

  if (rows.length === 0) return null

  return {
    jidDono: rows[0].jid_dono,
    nomeCliente: rows[0].nome_cliente
  }
}

async function buscarColaboradores() {
  const { rows } = await pool.query(`
    SELECT
      "ID",
      "Nome",
      "Telefone",
      COALESCE("Administrador", 'N') AS "Administrador"
    FROM public."wpp_colaboradores"
    WHERE "Telefone" IS NOT NULL
      AND TRIM("Telefone") <> ''
    ORDER BY "Nome"
  `)

  return rows
}

function limparNumero(jidOuNumero) {
  let numero = String(jidOuNumero || '')
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/\D/g, '')

  if (numero.length === 10 || numero.length === 11) {
    numero = `55${numero}`
  }

  return numero
}

function montarJid(numeroOuJid) {
  const numero = limparNumero(numeroOuJid)
  if (!numero) return null
  return `${numero}@s.whatsapp.net`
}

function gerarVariacoesNumero(jidOuNumero) {
  const numero = limparNumero(jidOuNumero)
  const set = new Set()

  if (!numero) return []

  set.add(numero)

  const sem9 = numero.replace(/^(\d{4})9(\d{8})$/, '$1$2')
  set.add(sem9)

  const com9 = numero.replace(/^(\d{4})(\d{8})$/, '$19$2')
  set.add(com9)

  return [...set].filter(Boolean)
}

function gerarChavesMatching(...jids) {
  const set = new Set()

  for (const jid of jids) {
    if (!jid) continue

    const jidStr = String(jid)
    set.add(jidStr)

    for (const variacao of gerarVariacoesNumero(jidStr)) {
      set.add(variacao)
      set.add(`${variacao}@s.whatsapp.net`)
    }
  }

  return [...set].filter(Boolean)
}

function extrairIdsParticipante(p) {
  const ids = []

  if (!p) return ids

  if (typeof p === 'string') {
    ids.push(p)
    return ids
  }

  if (p.id) ids.push(p.id)
  if (p.jid) ids.push(p.jid)
  if (p.phoneNumber) ids.push(p.phoneNumber)
  if (p.lid) ids.push(p.lid)

  return ids.filter(Boolean)
}

function participanteBateComChaves(participanteIds, chaves) {
  for (const id of participanteIds) {
    const idStr = String(id)
    const idNumero = limparNumero(idStr)

    for (const chave of chaves) {
      const chaveStr = String(chave)
      const chaveNumero = limparNumero(chaveStr)

      if (idStr === chaveStr) return true

      if (chaveNumero && idNumero && idNumero.startsWith(chaveNumero)) return true
      if (chaveNumero && idNumero && chaveNumero.startsWith(idNumero)) return true
    }
  }

  return false
}

function participanteEhAdmin(participante) {
  if (!participante || typeof participante === 'string') return false

  const admin = String(participante.admin || '').toLowerCase()

  return admin === 'admin' || admin === 'superadmin'
}

function encontrarParticipanteNoGrupo(grupo, ...jids) {
  const chaves = gerarChavesMatching(...jids)

  for (const participante of grupo.participantsRaw || []) {
    const idsParticipante = extrairIdsParticipante(participante)

    if (participanteBateComChaves(idsParticipante, chaves)) {
      return {
        encontrado: true,
        ids: idsParticipante,
        participante,
        isAdmin: participanteEhAdmin(participante)
      }
    }
  }

  for (const participanteId of grupo.participants || []) {
    if (participanteBateComChaves([participanteId], chaves)) {
      return {
        encontrado: true,
        ids: [participanteId],
        participante: participanteId,
        isAdmin: false
      }
    }
  }

  return {
    encontrado: false,
    ids: [],
    participante: null,
    isAdmin: false
  }
}

function encontrarGrupoPorJids(gruposDoBarco, jidDonoBruto, jidDonoFinal, addLog) {
  const chaves = gerarChavesMatching(jidDonoBruto, jidDonoFinal)

  addLog(`Chaves de matching do cliente: ${chaves.join(', ')}`)

  for (const grupo of gruposDoBarco) {
    const achou = encontrarParticipanteNoGrupo(grupo, jidDonoBruto, jidDonoFinal)

    if (achou.encontrado) {
      return {
        grupo,
        participanteEncontrado: achou.ids.join(' | ')
      }
    }
  }

  return null
}

async function confirmarJidWhatsApp(sock, jid, addLog) {
  const numero = limparNumero(jid)

  try {
    const variacoes = gerarVariacoesNumero(numero)

    for (const variacao of variacoes) {
      const check = await sock.onWhatsApp(variacao)

      if (check && check.length > 0 && check[0].exists) {
        addLog(`JID confirmado pelo WhatsApp: ${check[0].jid}`)
        return check[0].jid
      }
    }

    addLog(`JID bruto não encontrado no WhatsApp: ${jid}`)
    return jid
  } catch (e) {
    addLog(`Erro ao confirmar JID ${jid}: ${e.message}`)
    return jid
  }
}

async function validarMembrosWhatsApp(sock, membrosBrutos, addLog) {
  const membrosValidos = []

  addLog(`Membros brutos: ${membrosBrutos.join(', ')}`)

  for (const jid of membrosBrutos) {
    try {
      const variacoes = gerarVariacoesNumero(jid)
      let jidConfirmado = null

      for (const numero of variacoes) {
        const check = await sock.onWhatsApp(numero)

        if (check && check.length > 0 && check[0].exists) {
          jidConfirmado = check[0].jid
          break
        }
      }

      if (jidConfirmado) {
        if (!membrosValidos.includes(jidConfirmado)) {
          membrosValidos.push(jidConfirmado)
        }

        addLog(`JID válido no WhatsApp: ${jidConfirmado}`)
      } else {
        addLog(`JID NÃO encontrado no WhatsApp: ${jid}`)
      }
    } catch (e) {
      addLog(`Erro ao validar JID ${jid}: ${e.message}`)
    }
  }

  return membrosValidos
}

async function prepararColaboradores(sock, addLog) {
  const colaboradores = await buscarColaboradores()

  addLog(`Colaboradores cadastrados: ${colaboradores.length}`)

  const preparados = []

  for (const colab of colaboradores) {
    const jidBruto = montarJid(colab.Telefone)

    if (!jidBruto) {
      addLog(`Colaborador sem telefone válido: ${colab.Nome}`)
      continue
    }

    const membrosValidos = await validarMembrosWhatsApp(sock, [jidBruto], addLog)
    const jidFinal = membrosValidos.length > 0 ? membrosValidos[0] : jidBruto

    const admin = String(colab.Administrador || 'N').toUpperCase() === 'S'

    preparados.push({
      id: colab.ID,
      nome: colab.Nome,
      telefone: colab.Telefone,
      administrador: admin,
      jidBruto,
      jidFinal
    })

    addLog(`Colaborador preparado: ${colab.Nome} | ${jidFinal} | Admin=${admin ? 'S' : 'N'}`)
  }

  return preparados
}

async function sincronizarColaboradoresNoGrupo(sock, grupo, colaboradores, addLog) {
  const adicionados = []
  const jaExistiam = []
  const promovidos = []
  const rebaixados = []
  const falhas = []

  for (const colab of colaboradores) {
    const achou = encontrarParticipanteNoGrupo(grupo, colab.jidBruto, colab.jidFinal)

    if (!achou.encontrado) {
      try {
        await sock.groupParticipantsUpdate(grupo.id, [colab.jidFinal], 'add')
        adicionados.push(colab.jidFinal)
        addLog(`Colaborador incluído no grupo: ${colab.nome} | ${colab.jidFinal}`)
      } catch (e) {
        falhas.push({ nome: colab.nome, acao: 'add', erro: e.message })
        addLog(`Falha ao incluir colaborador ${colab.nome}: ${e.message}`)
        continue
      }
    } else {
      jaExistiam.push(colab.jidFinal)
      addLog(`Colaborador já estava no grupo: ${colab.nome}`)
    }

    if (colab.administrador) {
      try {
        await sock.groupParticipantsUpdate(grupo.id, [colab.jidFinal], 'promote')
        promovidos.push(colab.jidFinal)
        addLog(`Colaborador promovido a admin: ${colab.nome}`)
      } catch (e) {
        falhas.push({ nome: colab.nome, acao: 'promote', erro: e.message })
        addLog(`Aviso: não foi possível promover ${colab.nome} a admin: ${e.message}`)
      }
    } else if (achou.encontrado && achou.isAdmin) {
      try {
        await sock.groupParticipantsUpdate(grupo.id, [colab.jidFinal], 'demote')
        rebaixados.push(colab.jidFinal)
        addLog(`Colaborador rebaixado para participante comum: ${colab.nome}`)
      } catch (e) {
        falhas.push({ nome: colab.nome, acao: 'demote', erro: e.message })
        addLog(`Aviso: não foi possível rebaixar ${colab.nome}: ${e.message}`)
      }
    }
  }

  return {
    adicionados,
    jaExistiam,
    promovidos,
    rebaixados,
    falhas
  }
}

function montarResumoGrupo(syncColaboradores) {
  return {
    colaboradoresAdicionados: syncColaboradores?.adicionados || [],
    colaboradoresJaExistiam: syncColaboradores?.jaExistiam || [],
    colaboradoresPromovidos: syncColaboradores?.promovidos || [],
    colaboradoresRebaixados: syncColaboradores?.rebaixados || [],
    falhasColaboradores: syncColaboradores?.falhas || []
  }
}

export async function handleCriarOuAtualizarGrupo(req, res, getSock, getConectado) {
  const sock = getSock()
  const conectado = getConectado()
  const log = []

  const addLog = (msg) => {
    console.log('[criar-grupo]', msg)
    log.push(msg)
  }

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado', log })
  }

  const { Cod_Embarcacao, Gropo_letra, Cod_Pessoa, Cod_Cliente, Plano } = req.body

  addLog(`Recebido: PB=${Cod_Embarcacao} Letra=${Gropo_letra} Pessoa=${Cod_Pessoa} Cliente=${Cod_Cliente} Plano=${Plano}`)

  if (!Cod_Embarcacao || !Gropo_letra || !Cod_Pessoa || !Cod_Cliente || !Plano) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando', log })
  }

  try {
    addLog('Buscando dados do dono...')

    const dadosDono = await buscarDadosDono(Cod_Pessoa)

    if (!dadosDono || !dadosDono.jidDono) {
      addLog(`JID não encontrado para Cod_Pessoa=${Cod_Pessoa}`)
      return res.status(404).json({
        erro: `Celular não encontrado para Cod_Pessoa ${Cod_Pessoa}`,
        log
      })
    }

    const jidDonoBruto = dadosDono.jidDono
    const nomeCliente = dadosDono.nomeCliente

    addLog(`Nome cliente: ${nomeCliente}`)
    addLog(`JID bruto encontrado: ${jidDonoBruto}`)
    addLog(`Variações do JID bruto: ${gerarVariacoesNumero(jidDonoBruto).join(', ')}`)

    const jidDonoFinal = await confirmarJidWhatsApp(sock, jidDonoBruto, addLog)

    addLog(`JID final usado no processo: ${jidDonoFinal}`)
    addLog(`Variações do JID final: ${gerarVariacoesNumero(jidDonoFinal).join(', ')}`)

    const colaboradores = await prepararColaboradores(sock, addLog)

    const nomeCorreto = montarNomeGrupo(
      Cod_Embarcacao,
      Gropo_letra,
      Cod_Cliente,
      Plano,
      nomeCliente
    )

    addLog(`Nome correto do grupo: ${nomeCorreto}`)

    addLog('Buscando grupos do WhatsApp...')

    const gruposWpp = await sock.groupFetchAllParticipating()

    const grupos = Object.entries(gruposWpp).map(([id, data]) => ({
      id,
      subject: data.subject,
      participantsRaw: data.participants || [],
      participants: (data.participants || []).flatMap(p => extrairIdsParticipante(p))
    }))

    addLog(`Total de grupos encontrados: ${grupos.length}`)

    const prefixoBarco = String(Cod_Embarcacao).trim().substring(0, 3)

    const gruposDoBarco = grupos.filter(g => {
      const subject = String(g.subject || '').trim()
      return subject.startsWith(prefixoBarco)
    })

    addLog(`Prefixo usado para grupos da embarcação: ${prefixoBarco}`)
    addLog(`Grupos da embarcação ${prefixoBarco}: ${gruposDoBarco.map(g => g.subject).join(', ') || 'nenhum'}`)

    let grupoMatch = null

    if (gruposDoBarco.length === 1) {
      grupoMatch = gruposDoBarco[0]
      addLog(`Apenas 1 grupo com prefixo ${prefixoBarco}, usando direto: ${grupoMatch.subject}`)
    } else if (gruposDoBarco.length > 1) {
      const resultado = encontrarGrupoPorJids(
        gruposDoBarco,
        jidDonoBruto,
        jidDonoFinal,
        addLog
      )

      if (resultado) {
        grupoMatch = resultado.grupo
        addLog(`Match encontrado pelo cliente no grupo: ${grupoMatch.subject}`)
        addLog(`Participante encontrado: ${resultado.participanteEncontrado}`)
      } else {
        addLog(`Nenhum grupo com prefixo ${prefixoBarco} contém o número/JID do cliente`)
      }
    }

    if (grupoMatch) {
      let acao = 'JA_OK'
      let de = grupoMatch.subject
      let para = grupoMatch.subject

      if (grupoMatch.subject !== nomeCorreto) {
        addLog(`Renomeando de "${grupoMatch.subject}" para "${nomeCorreto}"`)
        await sock.groupUpdateSubject(grupoMatch.id, nomeCorreto)
        addLog('Renomeado com sucesso!')

        acao = 'RENOMEADO'
        para = nomeCorreto
      } else {
        addLog('Grupo já está com o nome correto')
      }

      const syncColaboradores = await sincronizarColaboradoresNoGrupo(
        sock,
        grupoMatch,
        colaboradores,
        addLog
      )

      return res.json({
        acao,
        grupoId: grupoMatch.id,
        nome: nomeCorreto,
        de,
        para,
        jidDonoBruto,
        jidDonoFinal,
        nomeCliente,
        ...montarResumoGrupo(syncColaboradores),
        log
      })
    }

    addLog(`Nenhum grupo existente corresponde ao cliente — criando novo grupo: ${nomeCorreto}`)

    const membrosBrutos = [
      jidDonoFinal,
      ADM2_JID,
      ...colaboradores.map(c => c.jidFinal)
    ]

    const membrosValidos = await validarMembrosWhatsApp(sock, membrosBrutos, addLog)

    if (membrosValidos.length === 0) {
      return res.status(400).json({
        erro: 'Nenhum membro válido para criar o grupo',
        membrosBrutos,
        log
      })
    }

    addLog(`Membros válidos para criação: ${membrosValidos.join(', ')}`)

    try {
      const result = await sock.groupCreate(nomeCorreto, membrosValidos)
      const novoId = result.id

      addLog(`Grupo criado: ${novoId}`)

      const adminsParaPromover = [
        ADM2_JID,
        ...colaboradores
          .filter(c => c.administrador)
          .map(c => c.jidFinal)
      ]

      const adminsValidos = await validarMembrosWhatsApp(sock, adminsParaPromover, addLog)

      if (adminsValidos.length > 0) {
        try {
          await sock.groupParticipantsUpdate(novoId, adminsValidos, 'promote')
          addLog(`Admins promovidos: ${adminsValidos.join(', ')}`)
        } catch (errPromote) {
          addLog(`Aviso: grupo criado, mas não foi possível promover admins: ${errPromote.message}`)
        }
      }

      return res.json({
        acao: 'CRIADO',
        grupoId: novoId,
        nomeGrupo: nomeCorreto,
        jidDonoBruto,
        jidDonoFinal,
        nomeCliente,
        membrosValidos,
        colaboradoresIncluidosNaCriacao: colaboradores.map(c => ({
          nome: c.nome,
          jid: c.jidFinal,
          administrador: c.administrador ? 'S' : 'N'
        })),
        log
      })
    } catch (errCreate) {
      addLog(`ERRO ao criar grupo: ${errCreate.message}`)
      addLog(`Detalhe erro: ${JSON.stringify(errCreate, Object.getOwnPropertyNames(errCreate))}`)

      return res.status(500).json({
        erro: `Falha ao criar grupo: ${errCreate.message}`,
        detalhe: JSON.stringify(errCreate, Object.getOwnPropertyNames(errCreate)),
        jidDonoBruto,
        jidDonoFinal,
        nomeCliente,
        membrosValidos,
        log
      })
    }
  } catch (err) {
    addLog(`ERRO: ${err.message}`)
    console.error('[criar-ou-atualizar-grupo] ERRO:', err)

    return res.status(500).json({
      erro: err.message,
      log
    })
  }
}
