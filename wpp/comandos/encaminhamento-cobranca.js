// ============================================================
// wpp/comandos/encaminhamento-cobranca.js — V.2610302307
// Encaminhamento de respostas sobre cobranças
// ============================================================

// Mapeamento Centro de Custos → Grupo Responsável
const GRUPOS_RESPONSAVEIS = {
  '9': { // IMOBEM
    grupo: '120363429567064636@g.us',
    empresa: 'IMOBEM'
  },
  'default': { // ALLMAX, SUMMERMAX, outros
    grupo: '556332258473-1556910161@g.us',
    empresa: 'ALLMAX' // Ajustar conforme necessário
  }
}

const TIMEOUT_HORAS = 72 // 72 horas = 3 dias

/**
 * Busca última cobrança enviada ao cliente
 */
async function buscarUltimaCobranca(pool, celular) {
  // Limpar celular (remover formatação)
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
 * Determina empresa baseado em centro de custos
 */
function obterEmpresa(centroCusto) {
  // Buscar em mapeamento ou usar padrão
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
 * Gera mensagem para grupo responsável
 */
function gerarMensagemGrupo(cobranca, mensagemCliente, ehAudio = false) {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const vencimento = new Date(cobranca.data_vencimento).toLocaleDateString('pt-BR')
  const urlCobranca = gerarUrlCobranca(cobranca.id_asaas)

  if (ehAudio) {
    return `🔔 *RESPOSTA DE CLIENTE - COBRANÇA*

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
📋 *Descrição:* ${cobranca.descricao}
🔗 *Cobrança:* ${urlCobranca}`
  }

  return `🔔 *RESPOSTA DE CLIENTE - COBRANÇA*

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
📋 *Descrição:* ${cobranca.descricao}
🔗 *Cobrança:* ${urlCobranca}`
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

    // Buscar última cobrança do cliente
    const cobranca = await buscarUltimaCobranca(pool, remetente)

    if (!cobranca) {
      console.log('   ℹ️  Sem cobrança recente para este cliente')
      return false
    }

    console.log(`   💬 Resposta sobre cobrança detectada (Cliente ${cobranca.codigo_cliente})`)

    // 1. Responder ao cliente
    const empresa = obterEmpresa(cobranca.centro_custo)
    const respostaCliente = gerarMensagemRetorno(empresa, ehAudio)

    await sock.sendMessage(remetente, { text: respostaCliente })
    console.log(`   ✅ Resposta enviada ao cliente`)

    // 2. Encaminhar para grupo responsável
    const grupoResponsavel = obterGrupoResponsavel(cobranca.centro_custo)

    const msgGrupo = gerarMensagemGrupo(cobranca, {
      celular: remetente,
      texto: textoMensagem,
      duracao: mensagem.message?.audioMessage?.seconds
    }, ehAudio)

    await sock.sendMessage(grupoResponsavel, { text: msgGrupo })

    // Se for áudio, encaminhar o áudio também
    if (ehAudio) {
      await sock.sendMessage(grupoResponsavel, {
        forward: mensagem
      })
    }

    console.log(`   📨 Encaminhado para grupo responsável (${empresa})`)

    return true

  } catch (err) {
    console.error('   ❌ Erro ao processar resposta cobrança:', err.message)
    return false
  }
}
