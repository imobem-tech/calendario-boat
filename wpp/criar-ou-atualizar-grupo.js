// ============================================================
// wpp/criar-ou-atualizar-grupo.js
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

const ADM2_JID = '556332258473@s.whatsapp.net'

function montarNomeGrupo(codEmbarcacao, gropoLetra, codCliente, plano) {
  const unidade = String(plano || '').toLowerCase().includes('ctg') ? 'C' : 'G'
  const descricao = Number(codCliente) === 4255 ? 'ALLMAX COTAS' : 'SUMMER NÁUTICA'
  return `${codEmbarcacao}-${gropoLetra} _${unidade} ${descricao}`
}

async function buscarJidDono(codPessoa) {
  const { rows } = await pool.query(`
    SELECT REPLACE("Cliente_Telefone_Celular", '+', '') || '@s.whatsapp.net' AS jid_dono
    FROM public."Cliente"
    WHERE "Codigo" = $1
      AND "Cliente_Telefone_Celular" IS NOT NULL
    LIMIT 1
  `, [codPessoa])

  if (rows.length === 0) return null
  return rows[0].jid_dono
}

function limparNumero(jidOuNumero) {
  return String(jidOuNumero || '')
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/\D/g, '')
}

function gerarVariacoesNumero(jidOuNumero) {
  const numero = limparNumero(jidOuNumero)
  const set = new Set()

  if (!numero) return []

  set.add(numero)

  // Brasil: 55 + DDD + 9 + número com 8 dígitos
  // Ex.: 5563984380383 -> 556384380383
  const sem9 = numero.replace(/^(\d{4})9(\d{8})$/, '$1$2')
  set.add(sem9)

  // Brasil: 55 + DDD + número com 8 dígitos
  // Ex.: 556384380383 -> 5563984380383
  const com9 = numero.replace(/^(\d{4})(\d{8})$/, '$19$2')
  set.add(com9)

  return [...set].filter(Boolean)
}

function gerarChavesMatching(...jids) {
  const set = new Set()

  for (const jid of jids) {
    if (!jid) continue

    const jidStr = String(jid)

    // Mantém JID completo para match exato, inclusive @lid
    set.add(jidStr)

    // Adiciona número puro e variações com/sem 9
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

      // Match exato, útil para @lid
      if (idStr === chaveStr) return true

      // Match por número/variação
      if (chaveNumero && idNumero && idNumero.startsWith(chaveNumero)) return true
      if (chaveNumero && idNumero && chaveNumero.startsWith(idNumero)) return true
    }
  }

  return false
}

function encontrarGrupoPorJids(gruposDoBarco, jidDonoBruto, jidDonoFinal, addLog) {
  const chaves = gerarChavesMatching(jidDonoBruto, jidDonoFinal)

  addLog(`Chaves de matching do cliente: ${chaves.join(', ')}`)

  for (const grupo of gruposDoBarco) {
    for (const participante of grupo.participantsRaw || []) {
      const idsParticipante = extrairIdsParticipante(participante)

      if (participanteBateComChaves(idsParticipante, chaves)) {
        return {
          grupo,
          participanteEncontrado: idsParticipante.join(' | ')
        }
      }
    }

    // fallback para estrutura já normalizada
    for (const participanteId of grupo.participants || []) {
      if (participanteBateComChaves([participanteId], chaves)) {
        return {
          grupo,
          participanteEncontrado: participanteId
        }
      }
    }
  }

  return null
}

async function confirmarJidWhatsApp(sock, jid, addLog) {
  const numero = limparNumero(jid)

  try {
    const check = await sock.onWhatsApp(numero)

    if (check && check.length > 0 && check[0].exists) {
      addLog(`JID confirmado pelo WhatsApp: ${check[0].jid}`)
      return check[0].jid
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
      const numero = limparNumero(jid)
      const check = await sock.onWhatsApp(numero)

      if (check && check.length > 0 && check[0].exists) {
        if (!membrosValidos.includes(check[0].jid)) {
          membrosValidos.push(check[0].jid)
        }
        addLog(`JID válido no WhatsApp: ${check[0].jid}`)
      } else {
        addLog(`JID NÃO encontrado no WhatsApp: ${jid}`)
      }
    } catch (e) {
      addLog(`Erro ao validar JID ${jid}: ${e.message}`)
    }
  }

  return membrosValidos
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
    addLog('Buscando JID do dono...')

    const jidDonoBruto = await buscarJidDono(Cod_Pessoa)

    if (!jidDonoBruto) {
      addLog(`JID não encontrado para Cod_Pessoa=${Cod_Pessoa}`)
      return res.status(404).json({
        erro: `Celular não encontrado para Cod_Pessoa ${Cod_Pessoa}`,
        log
      })
    }

    addLog(`JID bruto encontrado: ${jidDonoBruto}`)
    addLog(`Variações do JID bruto: ${gerarVariacoesNumero(jidDonoBruto).join(', ')}`)

    const jidDonoFinal = await confirmarJidWhatsApp(sock, jidDonoBruto, addLog)

    addLog(`JID final usado no processo: ${jidDonoFinal}`)
    addLog(`Variações do JID final: ${gerarVariacoesNumero(jidDonoFinal).join(', ')}`)

    const nomeCorreto = montarNomeGrupo(Cod_Embarcacao, Gropo_letra, Cod_Cliente, Plano)
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

    // REGRA PRINCIPAL:
    // Seleciona todos os grupos que começam com os 3 primeiros dígitos da embarcação.
    // Ex.: PB=555 => pega 555 SUMMER..., 555-SUMMER..., 555_..., etc.
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
      if (grupoMatch.subject === nomeCorreto) {
        addLog('Grupo já está com o nome correto')

        return res.json({
          acao: 'JA_OK',
          grupoId: grupoMatch.id,
          nome: grupoMatch.subject,
          jidDonoBruto,
          jidDonoFinal,
          log
        })
      }

      addLog(`Renomeando de "${grupoMatch.subject}" para "${nomeCorreto}"`)

      await sock.groupUpdateSubject(grupoMatch.id, nomeCorreto)

      addLog('Renomeado com sucesso!')

      return res.json({
        acao: 'RENOMEADO',
        grupoId: grupoMatch.id,
        de: grupoMatch.subject,
        para: nomeCorreto,
        jidDonoBruto,
        jidDonoFinal,
        log
      })
    }

    addLog(`Nenhum grupo existente corresponde ao cliente — criando novo grupo: ${nomeCorreto}`)

    const membrosBrutos = [jidDonoFinal, ADM2_JID]
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

      try {
        await sock.groupParticipantsUpdate(novoId, membrosValidos, 'promote')
        addLog('Membros promovidos a admin')
      } catch (errPromote) {
        addLog(`Aviso: grupo criado, mas não foi possível promover admins: ${errPromote.message}`)
      }

      return res.json({
        acao: 'CRIADO',
        grupoId: novoId,
        nomeGrupo: nomeCorreto,
        jidDonoBruto,
        jidDonoFinal,
        membrosValidos,
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
