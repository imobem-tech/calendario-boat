// ============================================================
// COMANDO CALENDÁRIO (CCC / calendario / calendar)
// Allmax®2605222230
// ============================================================

import { buscarGrupoInfo, buscarAutorizado } from '../db.js'
import { gerarToken } from '../token.js'
import { MENU } from './menu.js'

const BASE_URL = process.env.BASE_URL_AGENDA || 'https://allmaxcalendar.vercel.app'
const PREVIEW_IMG = 'https://allmaxcalendar.vercel.app/agenda-preview.png'

export function ehComandoCalendario(texto) {
  return (
    /^c{3,}$/i.test(texto) ||
    /^calend[aá]rio$/i.test(texto) ||
    /^calendar$/i.test(texto)
  )
}

export async function handleCalendario(sock, pool, grupoId) {
  console.log(`📅 Comando Calendário — grupo ${grupoId}`)

  const grupoInfo = await buscarGrupoInfo(pool, grupoId)
  if (!grupoInfo) {
    console.log(`⚠️ Grupo ${grupoId} não encontrado`)
    return
  }

  const { pb, cota } = grupoInfo
  const aut = await buscarAutorizado(pool, pb, cota)

  if (!aut) {
    await sock.sendMessage(grupoId, {
      text: `⚠️ Nenhum autorizado ativo encontrado para esta embarcação.\nContate o administrador.${MENU}`
    })
    return
  }

  const token = gerarToken(pb, aut.gropo_letra, aut.cod_pessoa)
  const link = `${BASE_URL}/?t=${token}`

  await sock.sendMessage(grupoId, {
    image: { url: PREVIEW_IMG },
    caption: `📅 *Link de agendamento do dia*\n\n${link}\n\n_Válido somente hoje_${MENU}`
  })

  console.log(`✅ Token gerado para PB ${pb} / ${aut.gropo_letra}`)
}
