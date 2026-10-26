// ============================================================
// ⚠️ BACKUP: 2609110829_fila.js
// Data do backup: 11/09/2026 16:18
// Arquivo original: wpp/fila.js — V.260911161800
// ============================================================
//
// MOTIVO DO BACKUP:
// Implementação de suporte a envio de imagens pela fila de mensagens WhatsApp
//
// PROBLEMA RESOLVIDO:
// - Fila só suportava mensagens de texto
// - Necessidade de enviar imagem (HM.png) para 42 grupos das embarcações 576, 573, 586
//
// FUNÇÕES ALTERADAS:
// - processarFila(): Adicionado suporte para detectar mensagens JSON com tipo='imagem'
//   e enviar usando Buffer.from(base64) ao invés de texto puro
//
// SOLUÇÃO:
// - Detecta se mensagem é JSON válido com parse/try-catch
// - Se tipo='imagem', converte base64 para Buffer e envia com sock.sendMessage({image})
// - Mantém compatibilidade: mensagens texto continuam funcionando normalmente
// - Resultado: Fila agora processa tanto texto quanto imagens
//
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
