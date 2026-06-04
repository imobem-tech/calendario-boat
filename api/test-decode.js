// ============================================================
// Teste rápido de decode de token
// V.2606041330
// ============================================================

import { decodeToken } from './agendar.js'

const token = 'egceadbcdjfjdci'

console.log('Token:', token)

try {
  const resultado = decodeToken(token)
  console.log('Resultado:', resultado)

  if (resultado && resultado.grupo === 'E1') {
    console.log('✅ CORREÇÃO FUNCIONANDO - Grupo E1')
  } else if (resultado && resultado.grupo === '51') {
    console.log('❌ BUG AINDA PRESENTE - Grupo 51')
  } else {
    console.log('⚠️ Resultado inesperado:', resultado)
  }
} catch (err) {
  console.error('Erro:', err.message)
}
