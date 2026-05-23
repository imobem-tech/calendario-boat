// ============================================================
// COMANDO RETORNO (RRR) — Allmax®2605222350
// ============================================================

import { buscarGrupoInfo } from '../db.js'
import { MENU } from './menu.js'

// Estado em memória: grupoId → { agendamentoId, dadosRetorno, timeoutHandle }
const aguardandoRetorno = new Map()

export function ehComandoRetorno(texto) {
  return /^r{3,}$/i.test(texto)
}

export function estaAguardandoRetorno(grupoId) {
  return aguardandoRetorno.has(grupoId)
}

// ============================================================
// BUSCA COMANDA ABERTA
// ============================================================
async function buscarComandaAberta(pool, codAutorizado) {
  try {
    const rs = await pool.query(
      `SELECT COALESCE(SUM("Preco_Total"), 0) AS total
         FROM public."P_BOAT_z_12_Comandas"
        WHERE "Cliente_Cod" = $1
          AND "DT_Encerramento" IS NULL`,
      [codAutorizado]
    )
    const total = parseFloat(rs.rows[0]?.total || 0)
    return total > 1 ? total : null
  } catch (err) {
    console.error('Erro ao buscar comanda:', err.message)
    return null
  }
}

// ============================================================
// MONTA MENSAGEM DE RETORNO
// ============================================================
function montarMensagemRetorno(dadosRetorno) {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const dd = String(agora.getDate()).padStart(2, '0')
  const mm = String(agora.getMonth() + 1).padStart(2, '0')
  const hh = String(agora.getHours()).padStart(2, '0')
  const min = String(agora.getMinutes()).padStart(2, '0')

  const sufixo = `${dd}${hh}${min}`
  const dataHora = `${dd}/${mm} ${hh}:${min}`

  let msg = `RETORNO_${sufixo}\n`
  msg += `${dataHora}\n`
  msg += `Autorizado: ${dadosRetorno.codAutorizado}\n`
  msg += `Emb ${dadosRetorno.pb}-${dadosRetorno.grupoLetra}`

  if (dadosRetorno.comanda) {
    const valorFmt = dadosRetorno.comanda.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    msg += `\n\n*Comanda aberta R$ ${valorFmt}*`
  }

  return msg
}

// ============================================================
// CONFIRMAÇÃO DE RETORNO (S/N)
// ============================================================
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

    const msgRetorno = montarMensagemRetorno(estado.dadosRetorno)

    await sock.sendMessage(grupoId, {
      text: `✅ ${msgRetorno}${MENU}`
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

// ============================================================
// HANDLER PRINCIPAL RRR
// ============================================================
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
      `SELECT "ID", "Dt_Saída", "Dt_Retorno", "Cod_Autorizado", "Grupo_Comp_letra"
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND "Grupo_Comp_letra" = $2
          AND DATE("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
          AND "Dt_Desistencia" IS NULL
          AND "Dt_Cancela_saida" IS NULL
        LIMIT 1`,
      [pb, cota]
    )
  } else {
    rsAg = await pool.query(
      `SELECT "ID", "Dt_Saída", "Dt_Retorno", "Cod_Autorizado", "Grupo_Comp_letra"
         FROM public."P_BOAT_z_10_Saida_Emb"
        WHERE "Cod_Emb_PB" = $1
          AND DATE("Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
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

  // Caso B — saída não registrada
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

  // Caso D — tudo ok, busca comanda e confirma
  const codAutorizado = ag['Cod_Autorizado']
  const grupoLetra = ag['Grupo_Comp_letra']
  const comanda = await buscarComandaAberta(pool, codAutorizado)

  // Monta preview da mensagem para mostrar na confirmação
  const dadosRetorno = { pb, grupoLetra, codAutorizado, comanda }

  let textoConfirmacao = `❓ Confirma retorno S/N\n\nEmb ${pb}-${grupoLetra} | Autorizado: ${codAutorizado}`
  if (comanda) {
    const valorFmt = comanda.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    textoConfirmacao += `\n⚠️ Comanda aberta R$ ${valorFmt}`
  }

  await sock.sendMessage(grupoId, {
    text: textoConfirmacao
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
    dadosRetorno,
    timeoutHandle
  })
}
