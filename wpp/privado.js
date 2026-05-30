// ============================================================
// wpp/privado.js — V.2605281347
// Allmax Gestão de Cotas — Marujo⚓
// Handler de mensagens privadas (@s.whatsapp.net)
//
// Sub-handlers registrados:
//   - Confirmação de vinculação de Lid (saida.js)
//   - [futuras facilidades]
// ============================================================

// Map de estados pendentes no privado
// chave: remetente (jid normalizado)
// valor: { tipo, dados, timeoutHandle, grupoId, ... }
const estadosPrivado = new Map()

const CABECALHO =
`\`\`\`Assistente Virtual\`\`\`
*Marujo⚓*
\`\`\`------------------\`\`\``

// ============================================================
// REGISTRO DE ESTADO PENDENTE
// Chamado por outros módulos para aguardar resposta no privado
// ============================================================

export function registrarEstadoPrivado(remetente, estado) {
  const chave = String(remetente || '').trim().toLowerCase()
  estadosPrivado.set(chave, estado)
}

export function removerEstadoPrivado(remetente) {
  const chave = String(remetente || '').trim().toLowerCase()
  estadosPrivado.delete(chave)
}

export function temEstadoPrivado(remetente) {
  const chave = String(remetente || '').trim().toLowerCase()
  return estadosPrivado.has(chave)
}

// ============================================================
// HANDLER PRINCIPAL — chamado pelo server.js
// ============================================================

export async function tratarMensagemPrivada(sock, pool, remetente, texto) {
  const chave = String(remetente || '').trim().toLowerCase()
  const estado = estadosPrivado.get(chave)

  if (!estado) return false

  const msg = String(texto || '').trim().toLowerCase()

  // ---- CONFIRMAÇÃO DE VINCULAÇÃO DE LID ----
  if (estado.tipo === 'confirmar_vinculacao_lid') {
    clearTimeout(estado.timeoutHandle)
    estadosPrivado.delete(chave)

    if (msg === 's') {
      // Grava o Lid no banco
      await pool.query(
        `UPDATE public.wpp_colaboradores SET "Lid" = $1 WHERE "ID" = $2`,
        [estado.lid, estado.colabId]
      )

      // Confirma no privado
      await sock.sendMessage(remetente, {
        text: `${CABECALHO}\n\n✅ Vinculação confirmada!\nSeu acesso está ativo, ${estado.nomeColab}.`
      })

      // Avisa no grupo
      await sock.sendMessage(estado.grupoId, {
        text: `${CABECALHO}\n\n✅ Colaborador vinculado: *${estado.nomeColab}*`
      })

      console.log('LID_VINCULADO_CONFIRMADO', { nome: estado.nomeColab, lid: estado.lid })

    } else {
      // Recusou ou resposta inválida — trata como N
      await sock.sendMessage(remetente, {
        text: `${CABECALHO}\n\n❌ Vinculação cancelada.`
      })

      await sock.sendMessage(estado.grupoId, {
        text: `${CABECALHO}\n\n❌ Vinculação não confirmada: *${estado.nomeColab}*`
      })

      console.log('LID_VINCULADO_RECUSADO', { nome: estado.nomeColab })
    }

    return true
  }

  // [futuras facilidades — adicionar aqui novos tipos]

  return false
}
