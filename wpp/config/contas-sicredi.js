// ============================================================
// CONFIGURAÇÃO - CONTAS SICREDI
// V.260911215000
// ============================================================

/**
 * Configuração de contas do Sicredi por empresa
 *
 * IMPORTANTE: Cada empresa pode ter múltiplas contas no mesmo banco
 *
 * PREENCHER COM DADOS REAIS:
 * - agencia: Código da agência (sem DV)
 * - agencia_dv: Dígito verificador da agência
 * - conta: Número da conta (sem DV)
 * - conta_dv: Dígito verificador da conta
 */

export const CONTAS_SICREDI = [
  // ========================================
  // ALLMAX - Sicredi
  // ALLMAX GESTAO DE COTAS LTDA
  // ========================================
  {
    empresa: 'ALLMAX',
    codigo_banco: '748',
    nome_banco: 'Banco Cooperativo Sicredi S.A.',
    agencia: '0911',
    agencia_dv: '',
    conta: '000011170',
    conta_dv: '4',
    tipo_conta: 'Corrente',
    ativa: true
  },

  // ========================================
  // SUMMER - Sicredi
  // SUMMER NAUTICA LTDA
  // ========================================
  {
    empresa: 'SUMMER',
    codigo_banco: '748',
    nome_banco: 'Banco Cooperativo Sicredi S.A.',
    agencia: '0911',
    agencia_dv: '',
    conta: '000001050',
    conta_dv: '0',
    tipo_conta: 'Corrente',
    ativa: true
  },

  // ========================================
  // IMOBEM - Sicredi
  // IMOBEM IMOVEIS LTDA
  // ========================================
  {
    empresa: 'IMOBEM',
    codigo_banco: '748',
    nome_banco: 'Banco Cooperativo Sicredi S.A.',
    agencia: '0911',
    agencia_dv: '',
    conta: '000073243',
    conta_dv: '7',
    tipo_conta: 'Corrente',
    ativa: true
  },

  // ========================================
  // IMOBAN - Sicredi
  // IMOBAN EMPREENDIMENTOS LTDA
  // ========================================
  {
    empresa: 'IMOBAN',
    codigo_banco: '748',
    nome_banco: 'Banco Cooperativo Sicredi S.A.',
    agencia: '0911',
    agencia_dv: '',
    conta: '000028736',
    conta_dv: '7',
    tipo_conta: 'Corrente',
    ativa: true
  }
];

/**
 * Busca contas do Sicredi de uma empresa
 * @param {string} empresa - Nome da empresa
 * @returns {Array} Array de contas da empresa
 */
export function buscarContasSicredi(empresa) {
  return CONTAS_SICREDI.filter(conta =>
    conta.empresa === empresa && conta.ativa
  );
}

/**
 * Busca todas as contas ativas do Sicredi
 * @returns {Array} Array de todas as contas ativas
 */
export function buscarTodasContasSicredi() {
  return CONTAS_SICREDI.filter(conta => conta.ativa);
}

/**
 * Verifica se uma empresa tem conta no Sicredi
 * @param {string} empresa - Nome da empresa
 * @returns {boolean}
 */
export function temContaSicredi(empresa) {
  return CONTAS_SICREDI.some(conta =>
    conta.empresa === empresa && conta.ativa
  );
}

// ============================================================
// EXPORTAÇÃO PADRÃO
// ============================================================

export default CONTAS_SICREDI;

// ============================================================
// FIM
// ============================================================
