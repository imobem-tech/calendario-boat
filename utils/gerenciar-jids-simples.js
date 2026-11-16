// ============================================================
// utils/gerenciar-jids-simples.js — V.2611161110
// Funções para gerenciar 2 JIDs por cliente (solução simplificada)
//
// CAMPOS NA TABELA CLIENTE:
// - WhatsApp_JID   (1º JID)
// - WhatsApp_JID_2 (2º JID)
//
// USO:
// import { buscarClientePorJID, registrarJID } from './utils/gerenciar-jids-simples.js'
// ============================================================

/**
 * Busca cliente por JID (qualquer dos 2 campos)
 * Retorna: { codigo, nome, telefone, telefone_formatado, whatsapp_jid, whatsapp_jid_2 }
 * Retorna null se não encontrar
 */
export async function buscarClientePorJID(pool, jid) {
  try {
    const query = `
      SELECT
        "Codigo" as codigo,
        "Cliente_Nome" as nome,
        "Cliente_Telefone_Celular" as telefone,
        "WhatsApp_JID" as whatsapp_jid,
        "WhatsApp_JID_2" as whatsapp_jid_2
      FROM public."Cliente"
      WHERE "WhatsApp_JID" = $1
         OR "WhatsApp_JID_2" = $1
      LIMIT 1
    `

    const result = await pool.query(query, [jid])

    if (result.rowCount > 0) {
      const cliente = result.rows[0]

      // Formatar telefone para exibição
      cliente.telefone_formatado = formatarTelefone(cliente.telefone)

      return cliente
    }

    return null

  } catch (err) {
    console.error('Erro ao buscar cliente por JID:', err.message)
    return null
  }
}

/**
 * Registra um JID para um cliente
 * Lógica:
 * - Se WhatsApp_JID está vazio → salva lá
 * - Se WhatsApp_JID já tem valor diferente → salva em WhatsApp_JID_2
 * - Se ambos já têm valor → não faz nada (cliente já tem 2 JIDs)
 *
 * Retorna: true se registrou, false se não registrou
 */
export async function registrarJID(pool, codigoCliente, jid) {
  try {
    // 1. Buscar JIDs atuais do cliente
    const queryBusca = `
      SELECT "WhatsApp_JID", "WhatsApp_JID_2"
      FROM public."Cliente"
      WHERE "Codigo" = $1
    `

    const result = await pool.query(queryBusca, [codigoCliente])

    if (result.rowCount === 0) {
      console.error(`Cliente ${codigoCliente} não encontrado`)
      return false
    }

    const cliente = result.rows[0]
    const jid1 = cliente.whatsapp_jid
    const jid2 = cliente.whatsapp_jid_2

    // 2. JID já cadastrado? Não faz nada
    if (jid1 === jid || jid2 === jid) {
      console.log(`   ℹ️  JID já cadastrado para cliente ${codigoCliente}`)
      return true
    }

    // 3. Decidir onde salvar
    let queryUpdate = null

    if (!jid1) {
      // WhatsApp_JID está vazio → salva lá
      queryUpdate = `
        UPDATE public."Cliente"
        SET "WhatsApp_JID" = $1
        WHERE "Codigo" = $2
      `
    } else if (!jid2) {
      // WhatsApp_JID_2 está vazio → salva lá
      queryUpdate = `
        UPDATE public."Cliente"
        SET "WhatsApp_JID_2" = $1
        WHERE "Codigo" = $2
      `
    } else {
      // Ambos já têm valor → substituir o mais antigo (WhatsApp_JID)
      console.log(`   ⚠️  Cliente ${codigoCliente} já tem 2 JIDs, substituindo o 1º`)
      queryUpdate = `
        UPDATE public."Cliente"
        SET "WhatsApp_JID" = "WhatsApp_JID_2",
            "WhatsApp_JID_2" = $1
        WHERE "Codigo" = $2
      `
    }

    // 4. Executar update
    await pool.query(queryUpdate, [jid, codigoCliente])
    console.log(`   📝 JID registrado: Cliente ${codigoCliente} → ${jid}`)

    return true

  } catch (err) {
    console.error('Erro ao registrar JID:', err.message)
    return false
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
 * Lista os JIDs de um cliente (útil para debug)
 * Retorna: array com até 2 JIDs
 */
export async function listarJIDsCliente(pool, codigoCliente) {
  try {
    const query = `
      SELECT "WhatsApp_JID", "WhatsApp_JID_2"
      FROM public."Cliente"
      WHERE "Codigo" = $1
    `

    const result = await pool.query(query, [codigoCliente])

    if (result.rowCount === 0) return []

    const cliente = result.rows[0]
    const jids = []

    if (cliente.whatsapp_jid) jids.push(cliente.whatsapp_jid)
    if (cliente.whatsapp_jid_2) jids.push(cliente.whatsapp_jid_2)

    return jids

  } catch (err) {
    console.error('Erro ao listar JIDs:', err.message)
    return []
  }
}
