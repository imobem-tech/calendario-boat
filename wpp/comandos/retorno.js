// ============================================================
// COMANDO RETORNO (RRR)
// Allmax®2605222230
// ============================================================

import { buscarGrupoInfo } from '../db.js'
import { MENU } from './menu.js'

// Estado em memória: grupoId → { agendamentoId, timeoutHandle }
const aguardandoRetorno = new Map()

export function ehComandoRetorno(texto) {
  return /^r{3,}$/i.test(texto)
}

export function estaAguardandoRetorno(grupoId) {
  return aguardandoRetorno.has(grupoId)
}

export async function handleConfirmacaoRetorno(sock, pool, grupoId, texto) {
  const estado = aguardandoRetorno.get(grupoId)

  if (/^s$/i.test(texto)) {
    clearTimeout(estado.timeoutHandle)
    aguardandoRetorno.delete(grupoId)

    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    await pool.query(
      `UPDATE public."P_BOAT_z_10_Saida_Emb"
          SET "Dt_Retorno" = $1
        WHERE "ID" = $2`,
      [agora, estado.agendamentoId]
    )

    await sock.sendMessage(grupoId, {
      text: `✅ RETORNO registrado.${MENU}`
    })
    console.log(`✅ Retorno registrado — agendamento ${estado.agendamentoId}`)

  } else if (/^n$/i.test(texto)) {
    clearTimeout(estado.timeoutHandle)
    aguardandoRetorno.delete(grupoId)

    await sock.sendMessage(grupoId, {
      text: `❌ Retorno Abortado.${MENU}`
    })

  } else {
    await sock.sendMessage(grupoId, {
      text: `❓ Confirma retorno S/N`
    })
  }
}

export async function handleRetorno(sock, pool, grupoId) {
  console.log(`🔄 Comando Retorno — grupo ${grupoId}`)

  const grupoInfo = await buscarGrupoInfo(pool, grupoId)
  if (!grupoInfo) {
    console.log(`⚠️ Grupo ${grupoId} não encontrado`)
    return
  }

  const { pb, cota } = grupoInfo

  const rsAg = await pool.query(
    `SELECT "ID", "Dt_Saída"
       FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" = $1
        AND "Grupo_Comp_letra" = COALESCE($2, "Grupo_Comp_letra")
        AND DATE("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
        AND "Dt_Desistencia" IS NULL
        AND "Dt_Cancela_saida" IS NULL
      LIMIT 1`,
    [pb, cota]
  )

  if (rsAg.rowCount === 0) {
    await sock.sendMessage(grupoId, {
      text: `ℹ️ Não encontrei agendamento para hoje.${MENU}`
    })
    return
  }

  const agendamento = rsAg.rows[0]

  if (!agendamento['Dt_Saída']) {
    await sock.sendMessage(grupoId, {
      text: `⚠️ Não consta registro da saída.${MENU}`
    })
    return
  }

  await sock.sendMessage(grupoId, {
    text: `❓ Confirma retorno S/N`
  })

  const timeoutHandle = setTimeout(async () => {
    if (aguardandoRetorno.has(grupoId)) {
      aguardandoRetorno.delete(grupoId)
      await sock.sendMessage(grupoId, {
        text: `⏱️ Tempo expirado, retorno Não Confirmado.${MENU}`
      })
    }
  }, 60 * 1000)

  aguardandoRetorno.set(grupoId, {
    agendamentoId: agendamento['ID'],
    timeoutHandle
  })
}
