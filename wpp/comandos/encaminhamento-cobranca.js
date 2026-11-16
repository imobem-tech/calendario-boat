// ============================================================
// wpp/comandos/encaminhamento-cobranca.js — V.2611161239
// Encaminhamento de respostas sobre cobranças
// FIX CRÍTICO (16/11 12:39): Busca com E SEM o 9º dígito!
//              - JID Alt pode vir COM ou SEM o 9 (depende do cadastro WhatsApp)
//              - 1ª tentativa: busca como veio
//              - 2ª tentativa: se 12 dígitos → adiciona 9 / se 13 → remove 9
//              - Garante encontrar cliente independente do formato
// 🎉 SOLUÇÃO COMPLETA (16/11 12:21): remoteJidAlt com número REAL!
//              - Captura remoteJidAlt (campo com número REAL!)
//              - Busca cliente pelo NÚMERO extraído do JID Alt
//              - Salva AMBOS JIDs (primário @lid + alternativo @s.whatsapp.net)
//              - Exibe TODOS dados no grupo ADM: pushName, JIDs, número formatado
//              - 100% de identificação garantida! ✅
// FIX CRÍTICO (16/11 11:52): Salva JID REAL da mensagem (não normalizado)
//              - API /enviar-jid normaliza JID (@lid → @s.whatsapp.net)
//              - Agora salva o JID que VEIO na mensagem (remetente)
//              - Preserva @lid se cliente responder com @lid
//              - Preserva qualquer formato original do WhatsApp
// MELHORIA (16/11 11:32): Captura JID em TODA resposta ao cliente
//              - Resposta ao cliente agora via endpoint /enviar-jid
//              - Captura JID real mesmo de clientes novos/não identificados
//              - Registra JID automaticamente quando identifica cliente
//              - Cliente com cobrança: identifica na 1ª resposta (antes: 2ª)
//              - Cliente troca número: identifica imediatamente
// MELHORIA (16/11 11:14): Sistema de 2 JIDs por cliente
//              - Usa WhatsApp_JID e WhatsApp_JID_2 (campo novo no banco)
//              - Busca funciona com qualquer JID (@s.whatsapp.net ou @lid)
//              - Registra automaticamente novos JIDs descobertos
//              - 100% de identificação de clientes
//              - Importa funções de utils/gerenciar-jids-simples.js
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

// Importar funções de gerenciamento de JIDs
import { buscarClientePorJID, registrarJID } from '../../utils/gerenciar-jids-simples.js'

// URL do bot (mesmo servidor, porta 3000)
const BOT_URL = process.env.BOT_URL || 'http://localhost:3000'

/**
 * Envia mensagem ao cliente VIA API e captura JID real
 * RETORNA: JID real usado pelo WhatsApp
 * VANTAGEM: Captura JID mesmo de clientes não identificados
 */
async function enviarMensagemComCapturaJID(jid, mensagem) {
  try {
    const resp = await fetch(`${BOT_URL}/enviar-jid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, mensagem })
    })

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      throw new Error(`Bot retornou ${resp.status}: ${txt}`)
    }

    // Capturar JID real retornado pela API
    const data = await resp.json()
    const jidReal = data.destino || jid  // fallback

    console.log(`   📡 Resposta enviada - JID: ${jid} → ${jidReal}${jid !== jidReal ? ' (DIFERENTE!)' : ''}`)

    return jidReal  // ← RETORNA JID REAL! ✅
  } catch (err) {
    console.error(`   ⚠️  Erro ao enviar via API:`, err.message)
    // Fallback: retorna JID original se API falhar
    return jid
  }
}

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

// REMOVIDA: buscarClientePorJID() agora está em utils/gerenciar-jids-simples.js
// Busca por WhatsApp_JID OU WhatsApp_JID_2 (2 campos)

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

// REMOVIDA: atualizarJIDCliente() agora é registrarJID() em utils/gerenciar-jids-simples.js
// Salva em WhatsApp_JID ou WhatsApp_JID_2 conforme disponibilidade

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
function gerarCabecalhoGrupo(cobranca, cliente, origem = 'cobranca', dadosWhatsApp = {}) {
  const vencimento = new Date(cobranca.data_vencimento).toLocaleDateString('pt-BR')

  const emoji = origem === 'cobranca' ? '💰' : '📋'
  const titulo = origem === 'cobranca'
    ? 'COBRANÇA | RESPOSTA RECEBIDA'
    : 'CONTA PRÓXIMA | CONTATO RECEBIDO'

  // Dados do cliente (usa dados da cobrança se cliente não foi passado)
  const codigo = cliente?.codigo || cobranca.codigo_cliente
  const nome = cliente?.nome || cobranca.nome_cliente
  const telefone = cliente?.telefone_formatado || 'N/A'

  // 📊 DADOS EXTRAS DO WHATSAPP
  let infoExtra = ''

  if (dadosWhatsApp.pushName) {
    infoExtra += `\n👤 Nome WhatsApp: ${dadosWhatsApp.pushName}`
  }

  if (dadosWhatsApp.jidAlt) {
    const numeroAlt = formatarNumeroWhatsApp(dadosWhatsApp.jidAlt)
    infoExtra += `\n📱 Tel Alt: ${numeroAlt}`
  }

  if (dadosWhatsApp.jidPrimario && dadosWhatsApp.jidPrimario !== dadosWhatsApp.jidAlt) {
    infoExtra += `\n🆔 JID: ${dadosWhatsApp.jidPrimario}`
  }

  return `${emoji} *${titulo}*

👤 *${nome}* (#${codigo})
📞 ${telefone}${infoExtra}
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
  // ⚠️ IMPORTANTE: @lid NÃO contém número de telefone real!
  // É um ID aleatório do WhatsApp

  // Detectar sufixo
  const partes = jid.split('@')
  const numero = partes[0]
  const sufixo = partes[1] || ''

  // Se não tem dígitos, retorna original
  if (!/^\d+$/.test(numero)) return jid

  // Se for @lid: NÃO formatar como telefone (não é!)
  if (sufixo === 'lid') {
    return `${jid} (ID interno WhatsApp)`
  }

  // Se for @s.whatsapp.net ou @c.us: formatar como telefone
  if (sufixo === 's.whatsapp.net' || sufixo === 'c.us') {
    // Formatar conforme tamanho
    if (numero.length === 13) {
      // Formato: +55 11 99999-9999 (Brasil com 9)
      return `+${numero.slice(0, 2)} (${numero.slice(2, 4)}) ${numero.slice(4, 9)}-${numero.slice(9)}`
    } else if (numero.length === 12) {
      // Formato: +55 11 9999-9999 (Brasil sem 9)
      return `+${numero.slice(0, 2)} (${numero.slice(2, 4)}) ${numero.slice(4, 8)}-${numero.slice(8)}`
    } else if (numero.length > 10) {
      // Formato genérico internacional
      return `+${numero.slice(0, 2)} ${numero.slice(2)}`
    }
  }

  // Fallback: retorna JID completo
  return jid
}

// REMOVIDA: extrairNumeroDaJID() não é mais necessária
// Com 2 campos (WhatsApp_JID e WhatsApp_JID_2), busca funciona direto

/**
 * Gera cabeçalho para ambos grupos (sem cobrança identificada)
 * Mostra dados do cliente se encontrado
 */
function gerarCabecalhoSemIdentificacao(cliente, celularJid, dadosWhatsApp = {}) {
  // 📊 DADOS EXTRAS DO WHATSAPP
  let infoExtra = ''

  if (dadosWhatsApp.pushName) {
    infoExtra += `\n👤 Nome WhatsApp: ${dadosWhatsApp.pushName}`
  }

  if (dadosWhatsApp.jidAlt) {
    const numeroAlt = formatarNumeroWhatsApp(dadosWhatsApp.jidAlt)
    infoExtra += `\n📱 Tel Alt: ${numeroAlt}`
  }

  if (dadosWhatsApp.jidPrimario && dadosWhatsApp.jidPrimario !== dadosWhatsApp.jidAlt) {
    infoExtra += `\n🆔 JID: ${dadosWhatsApp.jidPrimario}`
  }

  if (cliente) {
    // Cliente encontrado no banco
    return `⚠️ *SEM COBRANÇA | CONTATO RECEBIDO*

👤 *${cliente.nome}* (#${cliente.codigo})
📞 ${cliente.telefone_formatado}${infoExtra}
⚠️ Sem cobrança/conta identificada
⚠️ Verificar manualmente qual empresa atender

💬 Abaixo a mensagem do cliente 👇`
  } else {
    // Cliente NÃO encontrado no banco
    // Tenta formatar o JID para exibição mais legível
    const numeroFormatado = formatarNumeroWhatsApp(celularJid)

    return `⚠️ *SEM COBRANÇA | CONTATO RECEBIDO*

👤 *Cliente não cadastrado*
📞 ${numeroFormatado}${infoExtra}
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
    // 🔍 CAPTURA: JID primário E alternativo + Nome do contato
    const remetente = mensagem.key.remoteJid           // @lid ou @s.whatsapp.net
    const remetenteAlt = mensagem.key.remoteJidAlt     // @s.whatsapp.net com número REAL!
    const pushName = mensagem.pushName                 // Nome do contato no WhatsApp

    // 📦 Dados para enviar ao grupo ADM (TODOS os dados aproveitáveis!)
    const dadosWhatsApp = {
      jidPrimario: remetente,
      jidAlt: remetenteAlt,
      pushName: pushName
    }

    console.log(`\n💬 Mensagem recebida`)
    console.log(`   JID: ${remetente}`)
    if (remetenteAlt) {
      console.log(`   JID Alt: ${remetenteAlt} ✅ (contém número real!)`)
    }

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
    // PASSO 1: Buscar cliente por JID (tenta Alt primeiro, depois primário)
    // ============================================================
    // 🎯 ESTRATÉGIA DUPLA:
    // 1. Se tem remoteJidAlt → buscar por número extraído dele (mais confiável!)
    // 2. Senão → buscar pelo remoteJid normal (como antes)

    let cliente = null

    // Tentar busca pelo JID alternativo (contém número real!)
    if (remetenteAlt) {
      console.log(`   🔍 Tentando buscar por JID Alt (contém número real)`)

      // Extrair número do JID Alt (ex: 556384887445@s.whatsapp.net → 556384887445)
      let numeroExtraido = remetenteAlt.split('@')[0]

      console.log(`   📞 Número extraído: ${numeroExtraido} (${numeroExtraido.length} dígitos)`)

      // Buscar cliente por número de telefone
      const queryPorNumero = `
        SELECT
          "Codigo" as codigo,
          "Cliente_Nome" as nome,
          "Cliente_Telefone_Celular" as telefone,
          "WhatsApp_JID" as whatsapp_jid,
          "WhatsApp_JID_2" as whatsapp_jid_2
        FROM public."Cliente"
        WHERE REPLACE(REPLACE(REPLACE(REPLACE("Cliente_Telefone_Celular", ' ', ''), '-', ''), '(', ''), ')', '') LIKE '%' || $1
        LIMIT 1
      `

      // 1ª TENTATIVA: Buscar com número como veio
      let resultNumero = await pool.query(queryPorNumero, [numeroExtraido.slice(-11)]) // últimos 11 dígitos

      if (resultNumero.rowCount > 0) {
        cliente = resultNumero.rows[0]
        cliente.telefone_formatado = formatarTelefone(cliente.telefone)
        console.log(`   ✅ Cliente encontrado (1ª tentativa - como veio): ${cliente.codigo}`)
      } else {
        // 2ª TENTATIVA: Se não encontrou, tentar com/sem o 9
        let numeroAlternativo = null

        if (numeroExtraido.length === 12) {
          // FALTA O 9 → Adicionar 9 após DDD
          numeroAlternativo = numeroExtraido.slice(0, 4) + '9' + numeroExtraido.slice(4)
          console.log(`   ⚠️ Número SEM 9 detectado (12 dígitos)`)
          console.log(`   🔄 Tentando com 9: ${numeroAlternativo}`)
        } else if (numeroExtraido.length === 13) {
          // TEM O 9 → Remover 9 após DDD
          numeroAlternativo = numeroExtraido.slice(0, 4) + numeroExtraido.slice(5)
          console.log(`   ⚠️ Número COM 9 detectado (13 dígitos)`)
          console.log(`   🔄 Tentando sem 9: ${numeroAlternativo}`)
        }

        if (numeroAlternativo) {
          resultNumero = await pool.query(queryPorNumero, [numeroAlternativo.slice(-11)])

          if (resultNumero.rowCount > 0) {
            cliente = resultNumero.rows[0]
            cliente.telefone_formatado = formatarTelefone(cliente.telefone)
            console.log(`   ✅ Cliente encontrado (2ª tentativa - com/sem 9): ${cliente.codigo}`)
          }
        }
      }
    }

    // Tentar busca tradicional por JID (se ainda não encontrou)
    if (!cliente) {
      cliente = await buscarClientePorJID(pool, remetente)

      if (cliente) {
        console.log(`   ✅ Cliente encontrado por JID primário: ${cliente.codigo}`)
      }
    }

    if (!cliente) {
      console.log(`   ℹ️  Cliente NÃO encontrado (nem por JID Alt, nem por JID primário)`)
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

      // Registrar AMBOS JIDs do cliente (se encontrou)
      if (cliente && cliente.codigo) {
        // Registrar JID primário (@lid ou @s.whatsapp.net)
        await registrarJID(pool, cliente.codigo, remetente)

        // Registrar JID alternativo (se existir e for diferente)
        if (remetenteAlt && remetenteAlt !== remetente) {
          await registrarJID(pool, cliente.codigo, remetenteAlt)
          console.log(`   📝 Salvos AMBOS JIDs: primário + alternativo`)
        }
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

          // Registrar JID do cliente
          await registrarJID(pool, cliente.codigo, remetente)
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

        // Responder ao cliente (genérico) VIA API
        const respostaGenerica = gerarMensagemGenericaCliente('ALLMAX', ehAudio)
        await enviarMensagemComCapturaJID(remetente, respostaGenerica)
        console.log('   ✅ Resposta genérica enviada')

        // Registrar JID do REMETENTE (não o normalizado da API!)
        // remetente = JID REAL que veio na mensagem (@lid se for o caso)
        if (cliente && cliente.codigo) {
          await registrarJID(pool, cliente.codigo, remetente)
          console.log(`   📝 JID registrado: ${remetente}`)
        }

        // NOVO LAYOUT: cabeçalho + forward
        const cabecalho = gerarCabecalhoSemIdentificacao(cliente, remetente, dadosWhatsApp)

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

    // SEMPRE responde ao cliente (TODA mensagem) VIA API
    const respostaCliente = gerarMensagemRetorno(empresa, ehAudio)
    await enviarMensagemComCapturaJID(remetente, respostaCliente)
    console.log(`   ✅ Resposta enviada`)

    // Registrar JID do REMETENTE (não o normalizado da API!)
    // remetente = JID REAL que veio na mensagem (@lid se for o caso)
    if (cliente && cliente.codigo) {
      await registrarJID(pool, cliente.codigo, remetente)
      console.log(`   📝 JID registrado: ${remetente}`)
    }

    // SEMPRE encaminha para grupo (TODA mensagem)
    // LAYOUT: cabeçalho + forward + rodapé

    // 1. Cabeçalho (passa dados do cliente buscado + dados WhatsApp)
    const cabecalho = gerarCabecalhoGrupo(cobranca, cliente, origem, dadosWhatsApp)
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
