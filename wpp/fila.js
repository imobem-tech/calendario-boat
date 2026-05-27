// ============================================================
// PROCESSADOR DE FILA DE MENSAGENS — Allmax®2605222230
// ============================================================

let processandoFila = false

export function getProcessandoFila() { return processandoFila }

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
        await sock.sendMessage(row.grupo_id, { text: row.mensagem })

        await pool.query(`
          UPDATE public.wpp_fila_agenda
          SET status = 'enviado', enviado_em = NOW(), erro = NULL
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
    console.error('Erro geral ao processar fila:', err)
  } finally {
    processandoFila = false
  }
}
