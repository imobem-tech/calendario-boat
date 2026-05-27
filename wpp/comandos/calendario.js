// ============================================================
// COMANDO CALENDÁRIO (CCC / calendario / calendar)
// Allmax®2605242125
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

// Valida formato de grupo: letra + número (ex: X1, S2) OU só números (ex: 11, 21)
function grupoLetraValido(grupoLetra) {
  const s = String(grupoLetra || '')
  return /^[A-Za-z]\d+$/.test(s) || /^\d+$/.test(s)
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

  // Determina o grupoLetra para o token:
  // 1. Se cota do grupo é válida (ex: X1, 11), usa ela
  // 2. Se gropo_letra do autorizado é válido, usa ele
  // 3. Caso contrário, erro
  let grupoLetra = null

  if (cota && grupoLetraValido(cota)) {
    grupoLetra = cota
  } else if (grupoLetraValido(aut.gropo_letra)) {
    grupoLetra = aut.gropo_letra
  } else {
    console.log(`⚠️ Grupo inválido — cota: ${cota}, gropo_letra: ${aut.gropo_letra}`)
    await sock.sendMessage(grupoId, {
      text: `⚠️ Configuração de grupo inválida para esta embarcação.\nContate o administrador.${MENU}`
    })
    return
  }

  const token = gerarToken(pb, grupoLetra, aut.cod_pessoa)
  const link = `${BASE_URL}/?t=${token}`

 await sock.sendMessage(grupoId, {
  text: `📅 *Link de agendamento do dia*\n\n${link}\n\n_Válido somente hoje_${MENU}`
})

  console.log(`✅ Token gerado para PB ${pb} / ${grupoLetra}`)
}
