// ============================================================
// ⚠️ BACKUP: 2610302325_encaminhamento-cobranca.js
// Data do backup: 30/10/2026 23:25
// Arquivo original: comandos/encaminhamento-cobranca.js — V.2610302319
// ============================================================
//
// MOTIVO DO BACKUP:
// Implementação do novo layout de encaminhamento:
// cabeçalho + forward nativo + rodapé (3 mensagens)
//
// PROBLEMA RESOLVIDO:
// - Layout anterior: mensagem única grande com texto colado
// - Áudio/imagem: precisava processar e reenviar
// - Perdia metadados originais
//
// FUNÇÕES ALTERADAS:
// - gerarMensagemGrupo() → substituída por gerarCabecalhoGrupo() + gerarRodape()
// - gerarMensagemSemIdentificacao() → substituída por gerarCabecalhoSemIdentificacao()
// - processarRespostaCobranca(): envia 3 mensagens em vez de 1
//
// SOLUÇÃO:
// - Cabeçalho com dados da cobrança
// - Forward nativo (mantém seta ↩️ do WhatsApp)
// - Rodapé com link e timestamp
// - Funciona para QUALQUER tipo (texto, áudio, imagem, vídeo)
// - Mais rápido (não precisa processar mídia)
//
// ============================================================
//
// CÓDIGO ORIGINAL ABAIXO (V.2610302319):
// ============================================================
// wpp/comandos/encaminhamento-cobranca.js — V.2610302319
// Encaminhamento de respostas sobre cobranças
// MELHORIAS:
// - Controle de múltiplas mensagens (responde só a primeira)
// - Busca contas próximas vencimento (não só avisos_historico)
// - Encaminha para ambos grupos se não identificar empresa
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
 */
async function buscarUltimaCobranca(pool, celular) {
  const celularLimpo = celular.replace(/\D/g, '')

  const query = `
    SELECT
      ah.id_asaas,
      ah.codigo_cliente,
      ah.valor,
      ah.descricao,
      ah.data_vencimento,
      ah.data_envio,
      c."Cliente_Nome" as nome_cliente,
      c."Centro_Custo" as centro_custo
    FROM public.avisos_historico ah
    INNER JOIN public."Cliente" c ON ah.codigo_cliente = c."Codigo"
    WHERE
      c."Cliente_Telefone_Celular" LIKE '%${celularLimpo.slice(-9)}%'
      AND ah.status = 'enviado'
      AND ah.data_envio > NOW() - INTERVAL '${TIMEOUT_HORAS} hours'
    ORDER BY ah.data_envio DESC
    LIMIT 1
  `

  const result = await pool.query(query)
  return result.rowCount > 0 ? result.rows[0] : null
}

/**
 * Busca cliente por celular
 */
async function buscarClientePorCelular(pool, celular) {
  const celularLimpo = celular.replace(/\D/g, '')

  const query = `
    SELECT
      "Codigo" as codigo,
      "Cliente_Nome" as nome,
      "Centro_Custo" as centro_custo
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

Sua ${tipo} foi recebida e encaminhada!

Nossa equipe financeira já foi avisada e retornará em breve.

Obrigado!`
}

/**
 * Gera mensagem genérica (sem empresa identificada)
 */
function gerarMensagemGenericaCliente(ehAudio = false) {
  const tipo = ehAudio ? 'áudio' : 'mensagem'

  return `Olá! 👋

Aqui é o 🤖 atendente digital da ALLMAX!

Sua ${tipo} foi recebida e encaminhada para nossa equipe financeira.

Eles retornarão em breve com as informações solicitadas.

Obrigado!`
}

/**
 * Gera mensagem para grupo responsável
 */
function gerarMensagemGrupo(cobranca, mensagemCliente, ehAudio = false, origem = 'cobranca') {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const vencimento = new Date(cobranca.data_vencimento).toLocaleDateString('pt-BR')
  const urlCobranca = gerarUrlCobranca(cobranca.id_asaas)

  const tipoOrigem = origem === 'cobranca'
    ? '🔔 *RESPOSTA DE CLIENTE - COBRANÇA*'
    : '🔔 *CONTATO DE CLIENTE - CONTA PRÓXIMA VENCIMENTO*'

  if (ehAudio) {
    return `${tipoOrigem}

👤 *Cliente:* ${cobranca.codigo_cliente} - ${cobranca.nome_cliente}
📱 *Celular:* ${mensagemCliente.celular}
🏢 *Empresa:* ${obterEmpresa(cobranca.centro_custo)}
💰 *Valor:* R$ ${cobranca.valor.toFixed(2)}
📅 *Vencimento:* ${vencimento}
⏰ *Respondeu em:* ${agora}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🎤 *ÁUDIO DO CLIENTE:*
━━━━━━━━━━━━━━━━━━━━━━━━━━

[Áudio encaminhado abaixo] ⬇️
Duração: ${mensagemCliente.duracao || '?'} segundos

━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *Descrição:* ${cobranca.descricao || 'N/A'}
🔗 *Cobrança:* ${urlCobranca}`
  }

  return `${tipoOrigem}

👤 *Cliente:* ${cobranca.codigo_cliente} - ${cobranca.nome_cliente}
📱 *Celular:* ${mensagemCliente.celular}
🏢 *Empresa:* ${obterEmpresa(cobranca.centro_custo)}
💰 *Valor:* R$ ${cobranca.valor.toFixed(2)}
📅 *Vencimento:* ${vencimento}
⏰ *Respondeu em:* ${agora}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 *MENSAGEM DO CLIENTE:*
━━━━━━━━━━━━━━━━━━━━━━━━━━

${mensagemCliente.texto}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *Descrição:* ${cobranca.descricao || 'N/A'}
🔗 *Cobrança:* ${urlCobranca}`
}

/**
 * Gera mensagem para ambos grupos (cliente sem identificação)
 */
function gerarMensagemSemIdentificacao(cliente, mensagemCliente, ehAudio = false) {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const clienteInfo = cliente
    ? `👤 *Cliente:* ${cliente.codigo} - ${cliente.nome}`
    : `👤 *Cliente:* Não identificado`

  if (ehAudio) {
    return `⚠️ *CONTATO DE CLIENTE - SEM COBRANÇA IDENTIFICADA*

${clienteInfo}
📱 *Celular:* ${mensagemCliente.celular}
⏰ *Horário:* ${agora}

⚠️ *Cliente NÃO possui cobrança enviada recentemente*
⚠️ *Não há contas próximas do vencimento*
⚠️ *Verificar manualmente qual empresa atender*

━━━━━━━━━━━━━━━━━━━━━━━━━━
🎤 *ÁUDIO DO CLIENTE:*
━━━━━━━━━━━━━━━━━━━━━━━━━━

[Áudio encaminhado abaixo] ⬇️
Duração: ${mensagemCliente.duracao || '?'} segundos`
  }

  return `⚠️ *CONTATO DE CLIENTE - SEM COBRANÇA IDENTIFICADA*

${clienteInfo}
📱 *Celular:* ${mensagemCliente.celular}
⏰ *Horário:* ${agora}

⚠️ *Cliente NÃO possui cobrança enviada recentemente*
⚠️ *Não há contas próximas do vencimento*
⚠️ *Verificar manualmente qual empresa atender*

━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 *MENSAGEM DO CLIENTE:*
━━━━━━━━━━━━━━━━━━━━━━━━━━

${mensagemCliente.texto}`
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

        // Mensagem para grupos
        const msgGrupos = gerarMensagemSemIdentificacao(cliente, {
          celular: remetente,
          texto: textoMensagem,
          duracao: mensagem.message?.audioMessage?.seconds
        }, ehAudio)

        // Enviar para AMBOS grupos
        await sock.sendMessage('120363429567064636@g.us', { text: msgGrupos }) // IMOBEM
        await sock.sendMessage('556332258473-1556910161@g.us', { text: msgGrupos }) // ALLMAX

        // Se for áudio, encaminhar também
        if (ehAudio) {
          await sock.sendMessage('120363429567064636@g.us', { forward: mensagem })
          await sock.sendMessage('556332258473-1556910161@g.us', { forward: mensagem })
        }

        console.log('   📨 Encaminhado para AMBOS grupos')
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
    const msgGrupo = gerarMensagemGrupo(cobranca, {
      celular: remetente,
      texto: textoMensagem,
      duracao: mensagem.message?.audioMessage?.seconds
    }, ehAudio, origem)

    await sock.sendMessage(grupoResponsavel, { text: msgGrupo })

    // Se for áudio, encaminhar o áudio também
    if (ehAudio) {
      await sock.sendMessage(grupoResponsavel, { forward: mensagem })
    }

    console.log(`   📨 Encaminhado para grupo ${empresa}`)

    return true

  } catch (err) {
    console.error('   ❌ Erro ao processar resposta cobrança:', err.message)
    return false
  }
}
