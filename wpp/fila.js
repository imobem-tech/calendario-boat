// ============================================================
// PROCESSADOR DE FILA DE MENSAGENS — Allmax®2605222230
// V.2611031418 - Validação de JID para números individuais
// ============================================================

let processandoFila = false

export function getProcessandoFila() { return processandoFila }

/**
 * Valida e resolve o JID correto para números individuais
 * Necessário porque números podem estar em formato @s.whatsapp.net ou @lid
 */
async function resolverJID(sock, jid) {
  // Grupos não precisam validação
  if (jid.endsWith('@g.us')) {
    return jid
  }

  // Para números individuais, consulta o WhatsApp
  try {
    const numero = jid.replace(/@.*$/, '')
    const [resultado] = await sock.onWhatsApp(numero)

    if (resultado?.exists) {
      // Loga quando há conversão de formato
      if (resultado.jid !== jid) {
        console.log(`[fila] JID resolvido: ${jid} → ${resultado.jid}`)
      }
      return resultado.jid
    } else {
      console.warn(`[fila] Número ${numero} não encontrado no WhatsApp`)
      return jid // Tenta enviar com o JID original mesmo assim
    }
  } catch (err) {
    console.warn(`[fila] Erro ao validar JID ${jid}:`, err.message)
    return jid // Em caso de erro, usa o JID original
  }
}

export async function processarFila(pool, sock, conectado, callbacks = {}) {
  if (processandoFila) return
  if (!conectado || !sock) return

  processandoFila = true

  try {
    const rs = await pool.query(`
      SELECT id, grupo_id, mensagem
      FROM public.wpp_fila_agenda
      WHERE status = 'pendente'
      ORDER BY id
      LIMIT 5
    `)

    for (const row of rs.rows) {
      try {
        // Resolve o JID correto antes de enviar
        const jidFinal = await resolverJID(sock, row.grupo_id)

        await sock.sendMessage(jidFinal, { text: row.mensagem })

        await pool.query(`
          UPDATE public.wpp_fila_agenda
          SET status = 'enviado', enviado_em = NOW() AT TIME ZONE 'America/Sao_Paulo', erro = NULL
          WHERE id = $1
        `, [row.id])

        if (callbacks.onEnviado) callbacks.onEnviado()

      } catch (err) {
        const erroMsg = err?.message || String(err)

        await pool.query(`
          UPDATE public.wpp_fila_agenda
          SET status = 'erro', erro = $2
          WHERE id = $1
        `, [row.id, erroMsg])

        if (callbacks.onErro) callbacks.onErro(erroMsg)
      }
    }

  } catch (err) {
    console.error('Erro geral ao processar fila:', err.message)
  } finally {
    processandoFila = false
  }
}
