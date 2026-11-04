// ============================================================
// wpp/comandos/encaminhamento-cobranca.js — V.2611040826
// Encaminhamento de respostas sobre cobranças
// FILTRO STATUS (04/11 08:26): Ignora interações com Status/Stories
//              - Adicionado filtro para status@broadcast
//              - Status/Stories não são mensagens diretas de clientes
//              - Evita falsos positivos no sistema de encaminhamento
// BLOQUEIO ANTI-SPAM (01/11 15:43):
// - Lista de números bloqueados (spam/bots)
// MUDANÇA (04/11 07:15): SEMPRE responde + SEMPRE encaminha
//              - Removido throttle que bloqueava encaminhamento
//              - Removido controle "só primeira mensagem"
//              - TODA mensagem privada: responde cliente + encaminha grupo
// MELHORIA (04/11 07:18): Cabeçalho com dados completos do cliente
//              - SEMPRE busca cliente no início (antes de buscar cobrança)
//              - Mostra: Código, Nome, Telefone formatado
//              - Telefone formatado: (XX) XXXXX-XXXX (legível)
//              - Mesmo sem cobrança, mostra dados do cliente se cadastrado
// MELHORIAS:
// - Busca contas próximas vencimento (não só avisos_historico)
// - Encaminha para ambos grupos se não identificar empresa
// - Layout melhorado: cabeçalho + forward nativo + rodapé
// FIX CRÍTICO (04/11 06:55): Corrigido erro "column c.Centro_Custo does not exist"
//              - Centro_Custo NÃO existe em Cliente, está em Contas_Receber
//              - Adicionado JOIN com Contas_Receber para buscar Centro_Custo correto
//              - Query agora busca cr."Centro_Custo" usando ah.id_conta_receber
// ============================================================

// ============================================================
// 🚫 BLOQUEIO ANTI-SPAM
// ============================================================
const NUMEROS_BLOQUEADOS = [
  '176716429443296', // Spam 01/11/2026
  '270283013361791'  // Spam 01/11/2026
]

function numeroEstaBloqueado(jid) {
  const numero = jid.replace(/@.*$/, '')
  return NUMEROS_BLOQUEADOS.includes(numero)
}

// Mapeamento Centro de Custos → Grupo Responsável
const GRUPOS_RESPONSAVEIS = {
  '9': { // IMOBEM
    grupo: '120363429567064636@g.us',
    empresa: 'IMOBEM'
  },
  'default': { // ALLMAX, SUMMERMAX, outros
    grupo: '556332258473-1556910161@g.us',
    empresa: 'ALLMAX'
  }
}

const TIMEOUT_HORAS = 72 // 72 horas = 3 dias

/**
 * Busca última cobrança enviada (avisos_historico)
 * BUSCA POR JID: Funciona com @lid, @s.whatsapp.net, qualquer formato
 * IMPORTANTE: centro_custo está em Contas_Receber (JOIN necessário)
 */
async function buscarUltimaCobranca(pool, jid) {
  // Buscar por JID (ID do WhatsApp) - funciona com @lid
  const query = `
    SELECT
      ah.id_asaas,
      ah.codigo_cliente,
      ah.valor,
      ah.descricao,
      ah.data_vencimento,
      ah.data_envio,
      ah.whatsapp_jid,
      c."Cliente_Nome" as nome_cliente,
      cr."Centro_Custo" as centro_custo
    FROM public.avisos_historico ah
    INNER JOIN public."Contas_Receber" cr ON ah.id_conta_receber = cr."ID"
    INNER JOIN public."Cliente" c ON ah.codigo_cliente = c."Codigo"
    WHERE
      ah.whatsapp_jid = $1
      AND ah.status = 'enviado'
      AND ah.data_envio > NOW() - INTERVAL '${TIMEOUT_HORAS} hours'
    ORDER BY ah.data_envio DESC
    LIMIT 1
  `

  const result = await pool.query(query, [jid])

  if (result.rowCount === 0) return null

  return result.rows[0]
}

/**
 * Busca cliente por JID do WhatsApp (ID interno)
 * PRIORIDADE 1: Busca pelo JID (ex: 143572351365182@lid)
 */
async function buscarClientePorJID(pool, jid) {
  const query = `
    SELECT
      "Codigo" as codigo,
      "Cliente_Nome" as nome,
      "Cliente_Telefone_Celular" as telefone,
      "WhatsApp_JID" as whatsapp_jid
    FROM public."Cliente"
    WHERE "WhatsApp_JID" = $1
    LIMIT 1
  `

  const result = await pool.query(query, [jid])

  if (result.rowCount > 0) {
    const cliente = result.rows[0]
    cliente.telefone_formatado = formatarTelefone(cliente.telefone)
    return cliente
  }

  return null
}

/**
 * Busca cliente por celular (FALLBACK - não funciona com @lid)
 * Retorna: codigo, nome, telefone formatado
 * NOTA: Centro_Custo NÃO existe em Cliente, está em Contas_Receber!
 */
async function buscarClientePorCelular(pool, celular) {
  const celularLimpo = celular.replace(/\D/g, '')

  const query = `
    SELECT
      "Codigo" as codigo,
      "Cliente_Nome" as nome,
      "Cliente_Telefone_Celular" as telefone,
      "WhatsApp_JID" as whatsapp_jid
    FROM public."Cliente"
    WHERE "Cliente_Telefone_Celular" LIKE '%${celularLimpo.slice(-9)}%'
    LIMIT 1
  `

  const result = await pool.query(query)

  if (result.rowCount > 0) {
    const cliente = result.rows[0]
    // Formatar telefone para exibição
    cliente.telefone_formatado = formatarTelefone(cliente.telefone)
    return cliente
  }

  return null
}

/**
 * Atualiza o JID do WhatsApp do cliente
 * Executa apenas se JID for diferente do cadastrado
 */
async function atualizarJIDCliente(pool, codigoCliente, jid) {
  try {
    const query = `
      UPDATE public."Cliente"
      SET "WhatsApp_JID" = $1
      WHERE "Codigo" = $2
        AND ("WhatsApp_JID" IS NULL OR "WhatsApp_JID" != $1)
    `

    const result = await pool.query(query, [jid, codigoCliente])

    if (result.rowCount > 0) {
      console.log(`   📝 JID atualizado para cliente ${codigoCliente}: ${jid}`)
    }
  } catch (err) {
    console.error(`   ⚠️  Erro ao atualizar JID:`, err.message)
  }
}

/**
 * Formata telefone do banco para exibição
 * Ex: "63999887766" → "(63) 99988-7766"
 */
function formatarTelefone(telefone) {
  if (!telefone) return 'N/A'

  const numeros = telefone.replace(/\D/g, '')

  if (numeros.length === 11) {
    // Celular com 9: (XX) 9XXXX-XXXX
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
  } else if (numeros.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`
  } else {
    return telefone
  }
}

/**
 * Busca contas próximas do vencimento (últimos 30 dias ou próximos 30 dias)
 */
async function buscarContasProximasVencimento(pool, codigoCliente) {
  const query = `
    SELECT
      cr."ID" as id_conta,
      cr."Id_Asaas" as id_asaas,
      cr."Codigo" as codigo_cliente,
      cr."Data_Vencimento" as data_vencimento,
      cr."Valor" as valor,
      cr."Descrição" as descricao,
      cr."Centro_Custo" as centro_custo,
      c."Cliente_Nome" as nome_cliente
    FROM public."Contas_Receber" cr
    INNER JOIN public."Cliente" c ON cr."Codigo" = c."Codigo"
    WHERE
      cr."Codigo" = $1
      AND cr."Data_Vencimento" BETWEEN (CURRENT_DATE - 30) AND (CURRENT_DATE + 30)
      AND cr."Data_Baixa" IS NULL
    ORDER BY cr."Data_Vencimento" DESC
    LIMIT 1
  `

  const result = await pool.query(query, [codigoCliente])
  return result.rowCount > 0 ? result.rows[0] : null
}

/**
 * Determina empresa baseado em centro de custos
 */
function obterEmpresa(centroCusto) {
  const config = GRUPOS_RESPONSAVEIS[centroCusto] || GRUPOS_RESPONSAVEIS['default']
  return config.empresa
}

/**
 * Gera URL da cobrança Asaas
 */
function gerarUrlCobranca(idAsaas) {
  if (!idAsaas) return 'URL indisponível'
  return `https://www.asaas.com/c/${idAsaas}`
}

/**
 * Gera mensagem de retorno ao cliente
 * SEMPRE usa "mensagem" (seja texto ou áudio)
 */
function gerarMensagemRetorno(empresa, ehAudio = false) {
  return `Olá! 👋

Aqui é o 🤖 atendente digital da ${empresa}!

Sua mensagem foi recebida e encaminhada para nossa equipe de atendimento, que retornará em breve.

Obrigado!`
}

/**
 * Gera mensagem genérica (sem empresa identificada)
 * SEMPRE usa "mensagem" (seja texto ou áudio)
 */
function gerarMensagemGenericaCliente(empresa = 'ALLMAX', ehAudio = false) {
  return `Olá! 👋

Aqui é o 🤖 atendente digital da ${empresa}!

Sua mensagem foi recebida e encaminhada para nossa equipe de atendimento, que retornará em breve.

Obrigado!`
}

/**
 * Gera cabeçalho para grupo (NOVO LAYOUT)
 * Agora recebe dados completos do cliente
 */
function gerarCabecalhoGrupo(cobranca, cliente, origem = 'cobranca') {
  const vencimento = new Date(cobranca.data_vencimento).toLocaleDateString('pt-BR')

  const emoji = origem === 'cobranca' ? '💰' : '📋'
  const titulo = origem === 'cobranca'
    ? 'COBRANÇA | RESPOSTA RECEBIDA'
    : 'CONTA PRÓXIMA | CONTATO RECEBIDO'

  // Dados do cliente (usa dados da cobrança se cliente não foi passado)
  const codigo = cliente?.codigo || cobranca.codigo_cliente
  const nome = cliente?.nome || cobranca.nome_cliente
  const telefone = cliente?.telefone_formatado || 'N/A'

  return `${emoji} *${titulo}*

👤 *${nome}* (#${codigo})
📞 ${telefone}
🏢 ${obterEmpresa(cobranca.centro_custo)}
💵 R$ ${parseFloat(cobranca.valor).toFixed(2)} (Vence: ${vencimento})

💬 Abaixo a mensagem do cliente 👇`
}

/**
 * Gera rodapé com infos extras (NOVO LAYOUT)
 */
function gerarRodape(cobranca) {
  const agora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  })
  const dataAgora = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const urlCobranca = gerarUrlCobranca(cobranca.id_asaas)

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ${cobranca.descricao || 'N/A'}
🔗 ${urlCobranca}
🕐 ${agora} | ${dataAgora}`
}

/**
 * Formata número de telefone do WhatsApp
 * Remove @s.whatsapp.net, @lid, @c.us, etc.
 * Formata para exibição legível
 */
function formatarNumeroWhatsApp(jid) {
  // Remove sufixos do WhatsApp (@s.whatsapp.net, @lid, @c.us, etc)
  const numero = jid.split('@')[0]

  // Se não tem dígitos, retorna original
  if (!/^\d+$/.test(numero)) return jid

  // Formatar conforme tamanho
  if (numero.length === 13) {
    // Formato: +55 11 99999-9999 (Brasil com 9)
    return `+${numero.slice(0, 2)} ${numero.slice(2, 4)} ${numero.slice(4, 9)}-${numero.slice(9)}`
  } else if (numero.length === 12) {
    // Formato: +55 11 9999-9999 (Brasil sem 9)
    return `+${numero.slice(0, 2)} ${numero.slice(2, 4)} ${numero.slice(4, 8)}-${numero.slice(8)}`
  } else if (numero.length > 10) {
    // Formato genérico internacional
    return `+${numero.slice(0, 2)} ${numero.slice(2)}`
  } else {
    // Retorna como está
    return numero
  }
}

/**
 * Gera cabeçalho para ambos grupos (sem cobrança identificada)
 * Mostra dados do cliente se encontrado
 */
function gerarCabecalhoSemIdentificacao(cliente, celularJid) {
  if (cliente) {
    // Cliente encontrado no banco
    return `⚠️ *SEM COBRANÇA | CONTATO RECEBIDO*

👤 *${cliente.nome}* (#${cliente.codigo})
📞 ${cliente.telefone_formatado}
⚠️ Sem cobrança/conta identificada
⚠️ Verificar manualmente qual empresa atender

💬 Abaixo a mensagem do cliente 👇`
  } else {
    // Cliente NÃO encontrado no banco
    return `⚠️ *SEM COBRANÇA | CONTATO RECEBIDO*

👤 *Cliente não cadastrado*
📞 WhatsApp: ${celularJid}
⚠️ Número não encontrado no sistema
⚠️ Verificar manualmente

💬 Abaixo a mensagem do cliente 👇`
  }
}

/**
 * Determina grupo responsável
 */
function obterGrupoResponsavel(centroCusto) {
  const config = GRUPOS_RESPONSAVEIS[centroCusto] || GRUPOS_RESPONSAVEIS['default']
  return config.grupo
}

/**
 * Processa resposta de cliente sobre cobrança
 */
export async function processarRespostaCobranca(sock, pool, mensagem) {
  try {
    const remetente = mensagem.key.remoteJid

    // 🚫 FILTRO: Ignora interações com Status/Stories
    if (remetente === 'status@broadcast') {
      console.log(`📱 Ignorando interação com Status/Story (status@broadcast)`)
      return false // Ignora status
    }

    // 🚫 BLOQUEIO: Números na lista negra
    if (numeroEstaBloqueado(remetente)) {
      console.log(`🚫 Número BLOQUEADO (spam): ${remetente}`)
      return false // Ignora completamente
    }

    const ehAudio = mensagem.message?.audioMessage !== undefined
    const textoMensagem = mensagem.message?.conversation ||
                         mensagem.message?.extendedTextMessage?.text || ''

    console.log(`\n💬 Mensagem privada recebida de: ${remetente}`)

    // ============================================================
    // PASSO 1: Buscar cliente por JID do WhatsApp (ID interno)
    // ============================================================
    let cliente = await buscarClientePorJID(pool, remetente)

    if (cliente) {
      console.log(`   ✅ Cliente encontrado por JID: ${cliente.codigo} - ${cliente.nome} - ${cliente.telefone_formatado}`)
    } else {
      console.log(`   ℹ️  Cliente não encontrado por JID: ${remetente}`)
    }

    // ============================================================
    // PASSO 2: Buscar em avisos_historico (últimas 72h)
    // ============================================================
    let cobranca = await buscarUltimaCobranca(pool, remetente)
    let origem = 'cobranca'

    if (cobranca) {
      console.log(`   ✅ Cobrança encontrada em avisos_historico (Cliente ${cobranca.codigo_cliente})`)

      // Se não tinha cliente por JID, buscar dados pelo código da cobrança
      if (!cliente) {
        cliente = await pool.query(`
          SELECT "Codigo" as codigo, "Cliente_Nome" as nome, "Cliente_Telefone_Celular" as telefone
          FROM "Cliente" WHERE "Codigo" = $1
        `, [cobranca.codigo_cliente])

        if (cliente.rowCount > 0) {
          cliente = cliente.rows[0]
          cliente.telefone_formatado = formatarTelefone(cliente.telefone)
        }
      }

      // Atualizar JID do cliente (se encontrou)
      if (cliente && cliente.codigo) {
        await atualizarJIDCliente(pool, cliente.codigo, remetente)
      }
    } else {
      console.log('   ℹ️  Sem cobrança em avisos_historico')

      // ============================================================
      // PASSO 3: Se tem cliente, buscar contas próximas vencimento
      // ============================================================
      if (cliente) {
        // Buscar contas próximas do vencimento
        cobranca = await buscarContasProximasVencimento(pool, cliente.codigo)

        if (cobranca) {
          console.log(`   ✅ Conta próxima encontrada: R$ ${cobranca.valor} - Venc: ${cobranca.data_vencimento}`)
          origem = 'conta'

          // Atualizar JID do cliente
          await atualizarJIDCliente(pool, cliente.codigo, remetente)
        } else {
          console.log('   ℹ️  Cliente sem contas próximas do vencimento')
        }
      } else {
        console.log('   ℹ️  Cliente não identificado no banco')
      }

      // ============================================================
      // ESTRATÉGIA 3: Se não encontrou NADA → Encaminhar para AMBOS grupos
      // ============================================================
      if (!cobranca) {
        console.log('   ⚠️  Encaminhando para AMBOS grupos (cliente/conta não identificados)')

        // Responder ao cliente (genérico)
        const respostaGenerica = gerarMensagemGenericaCliente('ALLMAX', ehAudio)
        await sock.sendMessage(remetente, { text: respostaGenerica })
        console.log('   ✅ Resposta genérica enviada ao cliente')

        // NOVO LAYOUT: cabeçalho + forward
        const cabecalho = gerarCabecalhoSemIdentificacao(cliente, remetente)

        // Enviar para AMBOS grupos (IMOBEM + ALLMAX)
        const grupos = ['120363429567064636@g.us', '556332258473-1556910161@g.us']

        for (const grupo of grupos) {
          // 1. Cabeçalho
          await sock.sendMessage(grupo, { text: cabecalho })

          // 2. Forward da mensagem original (com seta ↩️)
          await sock.sendMessage(grupo, { forward: mensagem })
        }

        console.log('   📨 Encaminhado para AMBOS grupos (novo layout)')
        return true
      }
    }

    // ============================================================
    // COBRANÇA/CONTA IDENTIFICADA → Responder cliente + Encaminhar para grupo
    // ============================================================
    const empresa = obterEmpresa(cobranca.centro_custo)
    const grupoResponsavel = obterGrupoResponsavel(cobranca.centro_custo)

    // SEMPRE responde ao cliente (TODA mensagem)
    const respostaCliente = gerarMensagemRetorno(empresa, ehAudio)
    await sock.sendMessage(remetente, { text: respostaCliente })
    console.log(`   ✅ Resposta enviada ao cliente`)

    // SEMPRE encaminha para grupo (TODA mensagem)
    // LAYOUT: cabeçalho + forward + rodapé

    // 1. Cabeçalho (passa dados do cliente buscado)
    const cabecalho = gerarCabecalhoGrupo(cobranca, cliente, origem)
    await sock.sendMessage(grupoResponsavel, { text: cabecalho })

    // 2. Forward da mensagem original (com seta ↩️)
    await sock.sendMessage(grupoResponsavel, { forward: mensagem })

    // 3. Rodapé
    const rodape = gerarRodape(cobranca)
    await sock.sendMessage(grupoResponsavel, { text: rodape })

    console.log(`   📨 Encaminhado para grupo ${empresa} (novo layout: 3 mensagens)`)

    return true

  } catch (err) {
    console.error('   ❌ Erro ao processar resposta cobrança:', err.message)
    return false
  }
}
