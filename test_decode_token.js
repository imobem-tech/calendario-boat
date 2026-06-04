// ============================================================
// Teste de Decodificação de Token
// V.2606041312
// ============================================================

const MAP = {
  a: "1", b: "2", c: "3", d: "4", e: "5",
  f: "6", g: "7", h: "8", i: "9", j: "0"
};

function decodificar(txt) {
  return String(txt || "")
    .split("")
    .map(ch => MAP[ch] || "")
    .join("");
}

function decodeTokenANTIGO(token) {
  const t = String(token || "").trim().toLowerCase();
  const m = t.match(/^([a-j]+)([a-z0-9])([a-j]+)([a-j]{4})([a-j]{4})([a-j]{2})$/);

  if (!m) return null;

  const pb = decodificar(m[1]);
  const grupoLetra = m[2].toUpperCase();
  const grupoNum = decodificar(m[3]);

  // BUG ANTIGO:
  const primeiroGrupo = decodificar(m[2]);  // ← decodifica a letra!
  const grupoFinal = primeiroGrupo ? `${primeiroGrupo}${grupoNum}` : `${grupoLetra}${grupoNum}`;

  return {
    pb,
    grupo: grupoFinal,
    grupoLetra,
    grupoNum,
    primeiroGrupo,  // debug
    m2: m[2]  // debug
  };
}

function decodeTokenNOVO(token) {
  const t = String(token || "").trim().toLowerCase();
  const m = t.match(/^([a-j]+)([a-z0-9])([a-j]+)([a-j]{4})([a-j]{4})([a-j]{2})$/);

  if (!m) return null;

  const pb = decodificar(m[1]);
  const grupoLetra = m[2].toUpperCase();
  const grupoNum = decodificar(m[3]);

  // CORREÇÃO:
  const grupoFinal = `${grupoLetra}${grupoNum}`;

  return {
    pb,
    grupo: grupoFinal
  };
}

console.log('🧪 Teste de Decodificação de Token\n')

const tokenE1 = 'egceadbcdjfjdci'  // Token real do grupo 573-E1

console.log(`Token: ${tokenE1}`)
console.log('')

console.log('═══════════════════════════════════════════')
console.log('❌ VERSÃO ANTIGA (COM BUG):')
console.log('═══════════════════════════════════════════')
const resultadoAntigo = decodeTokenANTIGO(tokenE1)
console.log(`PB: ${resultadoAntigo.pb}`)
console.log(`Grupo Final: ${resultadoAntigo.grupo}`)
console.log('')
console.log('DEBUG:')
console.log(`  m[2]: "${resultadoAntigo.m2}"`)
console.log(`  grupoLetra (uppercase): "${resultadoAntigo.grupoLetra}"`)
console.log(`  primeiroGrupo (decodificar): "${resultadoAntigo.primeiroGrupo}"`)
console.log(`  grupoNum: "${resultadoAntigo.grupoNum}"`)
console.log(`  RESULTADO: "${resultadoAntigo.primeiroGrupo}" + "${resultadoAntigo.grupoNum}" = "${resultadoAntigo.grupo}"`)

console.log('')
console.log('═══════════════════════════════════════════')
console.log('✅ VERSÃO NOVA (CORRIGIDA):')
console.log('═══════════════════════════════════════════')
const resultadoNovo = decodeTokenNOVO(tokenE1)
console.log(`PB: ${resultadoNovo.pb}`)
console.log(`Grupo Final: ${resultadoNovo.grupo}`)

console.log('')
console.log('═══════════════════════════════════════════')
console.log('📊 COMPARAÇÃO:')
console.log('═══════════════════════════════════════════')
console.log(`ANTES: Emb ${resultadoAntigo.pb} - ${resultadoAntigo.grupo}`)
console.log(`AGORA: Emb ${resultadoNovo.pb} - ${resultadoNovo.grupo}`)
console.log('')

if (resultadoAntigo.grupo === '51' && resultadoNovo.grupo === 'E1') {
  console.log('✅ BUG CORRIGIDO!')
  console.log('   Antes: 573-51 ❌')
  console.log('   Agora: 573-E1 ✅')
} else {
  console.log('⚠️ Resultado inesperado')
}
