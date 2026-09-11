// ============================================================
// CONFIGURAÇÃO - GRUPOS FINANCEIROS POR EMPRESA
// V.260911211500
// ============================================================

/**
 * IDs dos grupos WhatsApp financeiros de cada empresa
 *
 * COMO PREENCHER:
 * 1. Acesse: https://calendario-boat-production.up.railway.app/grupos
 * 2. Encontre os grupos financeiros de cada empresa
 * 3. Copie os IDs e cole abaixo
 *
 * OU
 *
 * 1. Mande uma mensagem em cada grupo
 * 2. Veja os logs do Railway
 * 3. Procure por "GRUPO FINANCEIRO DETECTADO"
 * 4. Copie os IDs
 */

export const GRUPOS_FINANCEIROS = {
  // ALLMAX - Grupo FINANCEIRO_ALLMAX (5 participantes)
  'ALLMAX': process.env.GRUPO_FINANCEIRO_ALLMAX || '120363301830276025@g.us',

  // IMOBEM - Grupo IMOBEM_FIN (3 participantes)
  'IMOBEM': process.env.GRUPO_FINANCEIRO_IMOBEM || '120363429252771476@g.us',

  // IMOBAN - Grupo IMOBAN_FIN (3 participantes)
  'IMOBAN': process.env.GRUPO_FINANCEIRO_IMOBAN || '120363431767658353@g.us',

  // SUMMER - Grupo TRANSFERÊNCIA CARTEIRA
  'SUMMER': process.env.GRUPO_FINANCEIRO_SUMMER || '120363023952918427@g.us'
};

/**
 * Verifica se um grupo é um grupo financeiro
 * @param {string} grupoId - ID do grupo (@g.us)
 * @returns {boolean}
 */
export function isGrupoFinanceiro(grupoId) {
  return Object.values(GRUPOS_FINANCEIROS).includes(grupoId);
}

/**
 * Identifica qual empresa pelo ID do grupo
 * @param {string} grupoId - ID do grupo (@g.us)
 * @returns {string|null} - Nome da empresa ou null
 */
export function identificarEmpresaPorGrupo(grupoId) {
  for (const [empresa, id] of Object.entries(GRUPOS_FINANCEIROS)) {
    if (id === grupoId) {
      return empresa;
    }
  }
  return null;
}

/**
 * Lista todos os grupos financeiros configurados
 * @returns {Array} Array de objetos {empresa, grupoId}
 */
export function listarGruposFinanceiros() {
  return Object.entries(GRUPOS_FINANCEIROS).map(([empresa, grupoId]) => ({
    empresa,
    grupoId,
    configurado: !grupoId.includes('XXXXX')
  }));
}

/**
 * Valida se todos os grupos estão configurados
 * @returns {Object} {valido: boolean, faltando: Array}
 */
export function validarConfiguracao() {
  const faltando = [];

  for (const [empresa, grupoId] of Object.entries(GRUPOS_FINANCEIROS)) {
    if (grupoId.includes('XXXXX')) {
      faltando.push(empresa);
    }
  }

  return {
    valido: faltando.length === 0,
    faltando,
    total: Object.keys(GRUPOS_FINANCEIROS).length,
    configurados: Object.keys(GRUPOS_FINANCEIROS).length - faltando.length
  };
}

// ============================================================
// EXPORTAÇÃO PADRÃO
// ============================================================

export default GRUPOS_FINANCEIROS;

// ============================================================
// FIM
// ============================================================
