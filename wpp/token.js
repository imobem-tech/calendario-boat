// ============================================================
// GERAÇÃO DE TOKEN DO DIA — Allmax®2605222230
// Formato: [PB][LetraGrupo][NumGrupo][CodAutorizado][MMDD][DV]
// Codificação: a=1,b=2,c=3,d=4,e=5,f=6,g=7,h=8,i=9,j=0
// ============================================================

const MAP_ENC = {
  '1':'a','2':'b','3':'c','4':'d','5':'e',
  '6':'f','7':'g','8':'h','9':'i','0':'j'
}

function encodificar(num) {
  return String(num).split('').map(d => MAP_ENC[d] || '').join('')
}

function calcularDVToken(pb, grupoNum, autorizado, mmdd) {
  const base = `${pb}${grupoNum}${autorizado}${mmdd}`
  const soma = base.split('').reduce((acc, n) => acc + Number(n), 0)
  return String(soma).padStart(2, '0')
}

export function gerarToken(pb, grupoLetra, codAutorizado) {
  const grupoTxt = String(grupoLetra || '').trim()

  const matchLetraNum = grupoTxt.match(/^([A-Za-z])(\d+)$/)
  const matchSoNum = grupoTxt.match(/^(\d+)$/)

  let letra = ''
  let grupoNum = ''

  if (matchLetraNum) {
    letra = matchLetraNum[1].toLowerCase()
    grupoNum = matchLetraNum[2]
  } else if (matchSoNum) {
    letra = encodificar(matchSoNum[1][0])
    grupoNum = matchSoNum[1].slice(1) || '0'
  } else {
    throw new Error(`Formato de grupo inválido: ${grupoLetra}`)
  }

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const mm = String(agora.getMonth() + 1).padStart(2, '0')
  const dd = String(agora.getDate()).padStart(2, '0')
  const mmdd = `${mm}${dd}`

  const pbLimpo = String(Math.round(pb))
  const autLimpo = String(Math.round(codAutorizado)).padStart(4, '0')
  const numLimpo = String(grupoNum)

  const dv = calcularDVToken(pbLimpo, numLimpo, autLimpo, mmdd)

  return (
    encodificar(pbLimpo) +
    letra +
    encodificar(numLimpo) +
    encodificar(autLimpo) +
    encodificar(mmdd) +
    encodificar(dv)
  )
}
