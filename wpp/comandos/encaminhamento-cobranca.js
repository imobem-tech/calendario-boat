// ============================================================
// wpp/comandos/encaminhamento-cobranca.js — V.2610302352
// Encaminhamento de respostas sobre cobranças
// MELHORIAS:
// - Controle de múltiplas mensagens (responde só a primeira)
// - Busca contas próximas vencimento (não só avisos_historico)
// - Encaminha para ambos grupos se não identificar empresa
// - Layout melhorado: cabeçalho + forward nativo + rodapé
// FIX CRÍTICO: Removido JOIN com Cliente na busca de avisos_historico
//              Centro_Custo já existe em avisos_historico
// AJUSTE: Mensagem ao cliente mais genérica ("equipe de atendimento")
//         Empresa dinâmica em mensagem genérica
// REVERT: Removida formatação de número - mostra JID original
//         143572351365182@lid (como está no WhatsApp)
// ============================================================

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

// ============================================================
// CONTROLE DE MÚLTIPLAS MENSAGENS
// Map: celular_idcobranca → { timestamp, respondido }
// ============================================================
const respostasEnviadas = new Map()

// Limpar memória a cada 6 horas
setInterval(() => {
  const SEIS_HORAS = 6 * 60 * 60 * 1000
  const agora = Date.now()

  for (const [key, dados] of respostasEnviadas.entries()) {
    if (agora - dados.timestamp > SEIS_HORAS) {
      respostasEnviadas.delete(key)
      console.log(`   🧹 Memória limpa: ${key}`)
    }
  }
}, 3600000) // Roda a cada 1h

/**
 * Busca última cobrança enviada (avisos_historico)
 * NOTA: avisos_historico JÁ TEM centro_custo, não precisa buscar de Cliente
 */
async function buscarUltimaCobranca(pool, celular) {
  const celularLimpo = celular.replace(/\D/g, '')

  // Primeiro buscar o código do cliente pelo celular
  const clienteQuery = `
    SELECT "Codigo" as codigo, "Cliente_Nome" as nome
    FROM public."Cliente"
    WHERE "Cliente_Telefone_Celular" LIKE '%${celularLimpo.slice(-9)}%'
    LIMIT 1
  `

  const clienteResult = await pool.query(clienteQuery)
  if (clienteResult.rowCount === 0) return null

  const cliente = clienteResult.rows[0]

  // Depois buscar última cobrança do cliente
  const query = `
    SELECT
      ah.id_asaas,
      ah.codigo_cliente,
      ah.valor,
      ah.descricao,
      ah.data_vencimento,
      ah.data_envio,
      ah.centro_custo
    FROM public.avisos_historico ah
    WHERE
      ah.codigo_cliente = $1
      AND ah.status = 'enviado'
      AND ah.data_envio > NOW() - INTERVAL '${TIMEOUT_HORAS} hours'
    ORDER BY ah.data_envio DESC
    LIMIT 1
  `

  const result = await pool.query(query, [cliente.codigo])

  if (result.rowCount === 0) return null

  // Adicionar nome do cliente ao resultado
  return {
    ...result.rows[0],
    nome_cliente: cliente.nome
  }
}

/**
 * Busca cliente por celular
 * NOTA: Centro_Custo NÃO existe em Cliente, está em Contas_Receber!
 */
async function buscarClientePorCelular(pool, celular) {
  const celularLimpo = celular.replace(/\D/g, '')

  const query = `
    SELECT
      "Codigo" as codigo,
      "Cliente_Nome" as nome
    FROM public."Cliente"
    WHERE "Cliente_Telefone_Celular" LIKE '%${celularLimpo.slice(-9)}%'
    LIMIT 1
  `

  const result = await pool.query(query)
  return result.rowCount > 0 ? result.rows[0] : null
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
 */
function gerarMensagemRetorno(empresa, ehAudio = false) {
  const tipo = ehAudio ? 'áudio' : 'mensagem'

  return `Olá! 👋

Aqui é o 🤖 atendente digital da ${empresa}!

Sua ${tipo} foi recebida e encaminhada para nossa equipe de atendimento, que retornará em breve.

Obrigado!`
}

/**
 * Gera mensagem genérica (sem empresa identificada)
 */
function gerarMensagemGenericaCliente(empresa = 'ALLMAX', ehAudio = false) {
  const tipo = ehAudio ? 'áudio' : 'mensagem'

  return `Olá! 👋

Aqui é o 🤖 atendente digital da ${empresa}!

Sua ${tipo} foi recebida e encaminhada para nossa equipe de atendimento, que retornará em breve.

Obrigado!`
}

/**
 * Gera cabeçalho para grupo (NOVO LAYOUT)
 */
function gerarCabecalhoGrupo(cobranca, celular, origem = 'cobranca') {
  const vencimento = new Date(cobranca.data_vencimento).toLocaleDateString('pt-BR')

  const emoji = origem === 'cobranca' ? '💰' : '📋'
  const titulo = origem === 'cobranca'
    ? 'COBRANÇA | RESPOSTA RECEBIDA'
    : 'CONTA PRÓXIMA | CONTATO RECEBIDO'

  return `${emoji} *${titulo}*

👤 ${cobranca.nome_cliente} (#${cobranca.codigo_cliente})
📞 ${celular}
🏢 ${obterEmpresa(cobranca.centro_custo)}
💵 R$ ${cobranca.valor.toFixed(2)} (Vence: ${vencimento})

💬 Cliente disse:`
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
 * Gera cabeçalho para ambos grupos (sem identificação)
 */
function gerarCabecalhoSemIdentificacao(cliente, celular) {
  const clienteInfo = cliente
    ? `${cliente.nome} (#${cliente.codigo})`
    : 'Não identificado'

  return `⚠️ *SEM COBRANÇA | CONTATO RECEBIDO*

👤 ${clienteInfo}
📞 ${celular}
⚠️ Sem cobrança/conta identificada
⚠️ Verificar manualmente

💬 Cliente disse:
━━━━━━━━━━━━━━━━━━━━━━━━━━`
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
    const ehAudio = mensagem.message?.audioMessage !== undefined
    const textoMensagem = mensagem.message?.conversation ||
                         mensagem.message?.extendedTextMessage?.text || ''

    console.log(`\n💬 Mensagem privada recebida de: ${remetente}`)

    // ============================================================
    // ESTRATÉGIA 1: Buscar em avisos_historico (últimas 72h)
    // ============================================================
    let cobranca = await buscarUltimaCobranca(pool, remetente)
    let origem = 'cobranca'

    if (cobranca) {
      console.log(`   ✅ Cobrança encontrada em avisos_historico (Cliente ${cobranca.codigo_cliente})`)
    } else {
      console.log('   ℹ️  Sem cobrança em avisos_historico')

      // ============================================================
      // ESTRATÉGIA 2: Buscar cliente e suas contas próximas vencimento
      // ============================================================
      const cliente = await buscarClientePorCelular(pool, remetente)

      if (cliente) {
        console.log(`   ✅ Cliente encontrado: ${cliente.codigo} - ${cliente.nome}`)

        // Buscar contas próximas do vencimento
        cobranca = await buscarContasProximasVencimento(pool, cliente.codigo)

        if (cobranca) {
          console.log(`   ✅ Conta próxima encontrada: R$ ${cobranca.valor} - Venc: ${cobranca.data_vencimento}`)
          origem = 'conta'
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
        const respostaGenerica = gerarMensagemGenericaCliente(ehAudio)
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
    // COBRANÇA/CONTA IDENTIFICADA → Encaminhar para grupo correto
    // ============================================================
    const empresa = obterEmpresa(cobranca.centro_custo)
    const grupoResponsavel = obterGrupoResponsavel(cobranca.centro_custo)

    // ============================================================
    // CONTROLE DE MÚLTIPLAS MENSAGENS
    // Só responde a PRIMEIRA mensagem de cada cobrança
    // ============================================================
    const chaveMemoria = `${remetente}_${cobranca.id_asaas || cobranca.id_conta}`
    const jaRespondeu = respostasEnviadas.has(chaveMemoria)

    if (!jaRespondeu) {
      // PRIMEIRA mensagem → Responder ao cliente
      const respostaCliente = gerarMensagemRetorno(empresa, ehAudio)
      await sock.sendMessage(remetente, { text: respostaCliente })
      console.log(`   ✅ Resposta enviada ao cliente (PRIMEIRA mensagem)`)

      // Marcar como respondido
      respostasEnviadas.set(chaveMemoria, {
        timestamp: Date.now(),
        id_cobranca: cobranca.id_asaas || cobranca.id_conta
      })
    } else {
      console.log(`   ℹ️  2ª+ mensagem - pulando resposta automática`)
    }

    // SEMPRE encaminha para grupo (primeira ou não)
    // NOVO LAYOUT: cabeçalho + forward + rodapé

    // Adicionar celular ao objeto cobrança para usar no cabeçalho
    cobranca.celular = remetente

    // 1. Cabeçalho
    const cabecalho = gerarCabecalhoGrupo(cobranca, remetente, origem)
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
