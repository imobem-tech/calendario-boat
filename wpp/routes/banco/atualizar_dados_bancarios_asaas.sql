-- ============================================================
-- ATUALIZAR DADOS BANCÁRIOS DOS LANÇAMENTOS ASAAS EXISTENTES
-- V.2609141710
-- Preenche agência/conta/dv dos registros que vieram sem esses dados
-- ============================================================

-- 1. ALLMAX
UPDATE bank_extratos
SET
  agencia = '0001',
  agencia_dv = NULL,
  conta = '6327105',
  conta_dv = '0',
  tipo_conta = 'Conta de Pagamento',
  nome_banco = 'Asaas I.P S.A',
  codigo_banco = '461'
WHERE empresa = 'ALLMAX'
  AND banco = 'Asaas'
  AND (agencia IS NULL OR conta IS NULL);

-- 2. IMOBEM
UPDATE bank_extratos
SET
  agencia = '0001',
  agencia_dv = NULL,
  conta = '6576593',
  conta_dv = '5',
  tipo_conta = 'Conta de Pagamento',
  nome_banco = 'Asaas I.P S.A',
  codigo_banco = '461'
WHERE empresa = 'IMOBEM'
  AND banco = 'Asaas'
  AND (agencia IS NULL OR conta IS NULL);

-- 3. SUMMER
UPDATE bank_extratos
SET
  agencia = '0001',
  agencia_dv = NULL,
  conta = '6327037',
  conta_dv = '5',
  tipo_conta = 'Conta de Pagamento',
  nome_banco = 'Asaas I.P S.A',
  codigo_banco = '461'
WHERE empresa = 'SUMMER'
  AND banco = 'Asaas'
  AND (agencia IS NULL OR conta IS NULL);

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================

-- Contar quantos registros foram atualizados
SELECT
  empresa,
  COUNT(*) as total,
  COUNT(CASE WHEN agencia IS NOT NULL THEN 1 END) as com_agencia,
  COUNT(CASE WHEN conta IS NOT NULL THEN 1 END) as com_conta
FROM bank_extratos
WHERE banco = 'Asaas'
GROUP BY empresa
ORDER BY empresa;

-- Verificar alguns registros atualizados
SELECT
  id,
  empresa,
  banco,
  agencia,
  conta,
  conta_dv,
  data,
  descricao_original,
  valor
FROM bank_extratos
WHERE banco = 'Asaas'
ORDER BY id DESC
LIMIT 20;

-- ============================================================
-- FIM
-- ============================================================
