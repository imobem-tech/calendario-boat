// ============================================================
// COMANDO RETORNO (RRR) — Allmax®2605222315
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

  // Caso 1: cota preenchida → filtra por grupo
  // Caso 2: cota NULL → busca qualquer agendamento do PB hoje
  let rsAg
  if (cota) {
    rsAg = await pool.query(
      `SELECT "ID", "Dt_Saída", "Dt_Retorno"
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND "Grupo_Comp_letra" = $2
          AND DATE("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
          AND "Dt_Desistencia" IS NULL
          AND "Dt_Cancela_saida" IS NULL
        LIMIT 1`,
      [pb, cota]
    )
  } else {
    rsAg = await pool.query(
      `SELECT "ID", "Dt_Saída", "Dt_Retorno"
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND DATE("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
          AND "Dt_Desistencia" IS NULL
          AND "Dt_Cancela_saida" IS NULL
        LIMIT 1`,
      [pb]
    )
  }

  // Caso A — sem agendamento hoje
  if (rsAg.rowCount === 0) {
    await sock.sendMessage(grupoId, {
      text: `ℹ️ Não encontrei agendamento para hoje.${MENU}`
    })
    return
  }

  const ag = rsAg.rows[0]

  // Caso B — agendamento existe mas saída não registrada
  if (!ag['Dt_Saída']) {
    await sock.sendMessage(grupoId, {
      text: `⚠️ Saída da embarcação não registrada no sistema.${MENU}`
    })
    return
  }

  // Caso C — retorno já registrado
  if (ag['Dt_Retorno']) {
    await sock.sendMessage(grupoId, {
      text: `ℹ️ Retorno já registrado para hoje.${MENU}`
    })
    return
  }

  // Caso D — saída registrada, retorno pendente → confirma
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
    agendamentoId: ag['ID'],
    timeoutHandle
  })
}
