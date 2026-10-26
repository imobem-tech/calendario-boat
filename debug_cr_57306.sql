-- ============================================================
-- DEBUG: Por que CR 57306 não vinculou?
-- Cliente: CHARLES COSTA LOPES
-- Valor extrato: R$ 199,00
-- Data extrato: 11/09/2026
-- ============================================================

-- 1. DADOS DA CR 57306:
SELECT
  "Codigo" as cr_codigo,
  "Código_Cliente" as cliente_codigo,
  "Data_Vencimento" as vencimento,
  "Total" as valor_cr,
  "Descrição" as descricao,
  "Empresa" as empresa
FROM "Contas_Receber"
WHERE "Codigo" = 57306;

-- 2. DADOS DO CLIENTE CHARLES COSTA LOPES:
SELECT
  "Codigo" as cliente_codigo,
  "Cliente_Nome" as nome,
  "Cliente_CPF" as cpf,
  "Empresa" as empresa
FROM "Cliente"
WHERE "Cliente_Nome" ILIKE '%CHARLES COSTA LOPES%';

-- 3. TOLERÂNCIAS:
-- Data extrato: 11/09/2026
-- Tolerância: ±10 dias = 01/09/2026 a 21/09/2026
-- Valor extrato: R$ 199,00
-- Tolerância: ±5% = R$ 189,05 a R$ 208,95

-- 4. VERIFICAR SE CR BATE:
SELECT
  cr."Codigo" as cr_codigo,
  cr."Data_Vencimento" as vencimento,
  cr."Total" as valor_cr,

  -- Diferença de dias
  ABS(EXTRACT(DAY FROM (cr."Data_Vencimento" - DATE '2026-09-11'))) as dif_dias,

  -- Diferença de valor percentual
  ABS((cr."Total" - 199.00) / cr."Total") as dif_valor_percent,

  -- Testes
  CASE
    WHEN ABS(EXTRACT(DAY FROM (cr."Data_Vencimento" - DATE '2026-09-11'))) <= 10
    THEN '✅ OK'
    ELSE '❌ FORA'
  END as teste_data,

  CASE
    WHEN ABS((cr."Total" - 199.00) / cr."Total") <= 0.05
    THEN '✅ OK'
    ELSE '❌ FORA'
  END as teste_valor

FROM "Contas_Receber" cr
WHERE cr."Codigo" = 57306;

-- 5. BUSCAR TODAS AS CRs DO CLIENTE (caso não seja 57306):
SELECT
  cr."Codigo" as cr_codigo,
  cr."Código_Cliente" as cliente_codigo,
  cr."Data_Vencimento" as vencimento,
  cr."Total" as valor_cr,
  cr."Descrição" as descricao,

  -- Diferença de dias
  ABS(EXTRACT(DAY FROM (cr."Data_Vencimento" - DATE '2026-09-11'))) as dif_dias,

  -- Diferença de valor
  ABS((cr."Total" - 199.00) / cr."Total") as dif_valor_percent,

  -- Passa nos testes?
  CASE
    WHEN ABS(EXTRACT(DAY FROM (cr."Data_Vencimento" - DATE '2026-09-11'))) <= 10
     AND ABS((cr."Total" - 199.00) / cr."Total") <= 0.05
    THEN '✅ BATE'
    ELSE '❌ NÃO BATE'
  END as resultado

FROM "Contas_Receber" cr
WHERE cr."Código_Cliente" = (
  SELECT "Codigo"
  FROM "Cliente"
  WHERE "Cliente_Nome" ILIKE '%CHARLES COSTA LOPES%'
  LIMIT 1
)
AND cr."Empresa" = 1  -- ALLMAX
ORDER BY ABS(EXTRACT(DAY FROM (cr."Data_Vencimento" - DATE '2026-09-11')));
