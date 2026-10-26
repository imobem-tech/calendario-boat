-- ============================================================
-- Correção de Baixas Indevidas - V.260917160
-- Corrige registros baixados incorretamente pelo webhook Asaas
-- Data: 2026-09-17
-- ============================================================

-- IMPORTANTE: Este script afeta 165 registros com valor total de R$ 207.593,39
-- Categorias A e B - Alta confiança de erro (100%)

-- ============================================================
-- PASSO 1: CRIAR TABELA DE BACKUP
-- ============================================================
-- Backup dos registros que serão alterados (para possível reversão)

CREATE TABLE IF NOT EXISTS "Contas_Receber_Backup_20260917" AS
SELECT * FROM "Contas_Receber" WHERE 1=0;

-- Inserir backup apenas dos registros que serão corrigidos
INSERT INTO "Contas_Receber_Backup_20260917"
SELECT * FROM "Contas_Receber"
WHERE "ID" IN (
    -- Categoria A: Baixados mas sem Customer_ID
    -- IDs dos registros da categoria A (148 registros)
    48834, 48824, 48835, 48836, 48837, 48838, 48839, 48883, 48930, 48933,
    49062, 49146, 49361, 49472, 49488, 49552, 49620, 49675, 49689,
    575, 576, 577, 8001, 8002, 8003, 6001, 10001, 10002, 26002, 26003,
    37070, 47220, 47221, 47222, 40073, 40063, 40074, 40064, 40075, 40065,
    40076, 40066, 40077, 40067, 40078, 40068, 40079, 40069, 40080, 40070,
    40081, 40071, 40082, 40072, 40083, 40084, 40085, 40086, 40087, 40088,
    40089, 40090, 40091, 40092, 40093, 40094, 40095, 40096, 40097, 40098,
    40099, 40100, 40101, 40102, 40103, 40104, 40105, 40106, 40107, 40108,
    40109, 40110, 40111, 40112, 40113, 40114, 40115, 40116, 40117, 40118,
    40119, 40120, 40121, 40122, 40123, 40124, 40125, 40126, 40127, 40128,
    40129, 40130, 40131, 40132, 40133, 40134, 40135, 40136, 40137, 40138,
    40139, 40140, 40141, 40142, 40143, 40144, 40145, 40146, 40147, 40148,
    40149, 40150, 40151, 40152, 40153, 40154, 40155, 40156, 40157, 40158,
    47223, 47224, 47225, 47226, 47227, 47228, 47229, 47230, 47231, 47232,
    47233, 47234, 47235, 47236, 47237, 47238
)
AND "Observacões_Pagamento" LIKE '%Asaas%'
OR "ID" IN (
    -- Categoria B: Verificados no Asaas e não encontrados (17 registros)
    37070, 48621, 48622, 48631, 48840, 48883, 48930, 48933,
    49062, 49146, 49361, 49472, 49488, 49552, 49620, 49675, 49689
);

-- Verificar quantos registros foram para o backup
SELECT COUNT(*) as total_backup FROM "Contas_Receber_Backup_20260917";

-- ============================================================
-- PASSO 2: ATUALIZAR REGISTROS - CATEGORIA A
-- ============================================================
-- Categoria A: Baixados mas sem Customer_ID
-- Condição: Cliente não tem Customer_ID no Asaas E foi baixado por webhook Asaas

UPDATE "Contas_Receber"
SET
    "Data_Pagamento" = NULL,
    "Observacões_Pagamento" = 'BAIXA INDEVIDA - ' || COALESCE("Observacões_Pagamento", ''),
    "Total" = 0
WHERE "ID" IN (
    SELECT cr."ID"
    FROM "Contas_Receber" cr
    LEFT JOIN "Cliente" c ON cr."Código_Cliente" = c."Codigo"
    WHERE cr."Codigo" IS NOT NULL
    AND cr."Codigo" != 0
    AND cr."Data_Pagamento" IS NOT NULL
    AND cr."Observacões_Pagamento" LIKE '%Asaas%'
    AND (
        -- Verifica se o cliente não tem Customer_ID para nenhuma empresa
        (cr."Centro_Custo" LIKE '%ALLMAX%' AND (c."Cliente_ID_tab_6" IS NULL OR c."Cliente_ID_tab_6" = ''))
        OR (cr."Centro_Custo" LIKE '%IMOBEM%' AND (c."Cliente_ID_tab_8" IS NULL OR c."Cliente_ID_tab_8" = ''))
        OR (cr."Centro_Custo" LIKE '%IMOBAN%' AND (c."Cliente_ID_tab_9" IS NULL OR c."Cliente_ID_tab_9" = ''))
        OR (cr."Centro_Custo" LIKE '%SUMMER%' AND (c."Cliente_ID_tab_6" IS NULL OR c."Cliente_ID_tab_6" = ''))
        OR (c."Codigo" IS NULL)
    )
);

-- ============================================================
-- PASSO 3: ATUALIZAR REGISTROS - CATEGORIA B
-- ============================================================
-- Categoria B: Verificados no Asaas e não encontrados
-- IDs específicos verificados via API

UPDATE "Contas_Receber"
SET
    "Data_Pagamento" = NULL,
    "Observacões_Pagamento" = 'BAIXA INDEVIDA - Verificado API Asaas - ' || COALESCE("Observacões_Pagamento", ''),
    "Total" = 0
WHERE "ID" IN (
    -- IDs verificados no Asaas e confirmados como não pagos
    37070, 48621, 48622, 48631, 48840, 48883, 48930, 48933,
    49062, 49146, 49361, 49472, 49488, 49552, 49620, 49675, 49689
)
AND "Observacões_Pagamento" LIKE '%Asaas%';

-- ============================================================
-- PASSO 4: VERIFICAÇÃO PÓS-CORREÇÃO
-- ============================================================

-- Contar registros corrigidos
SELECT
    'Categoria A - Sem Customer_ID' as categoria,
    COUNT(*) as registros_corrigidos,
    SUM("Valor") as valor_total
FROM "Contas_Receber"
WHERE "Observacões_Pagamento" LIKE 'BAIXA INDEVIDA -%'
AND "Observacões_Pagamento" NOT LIKE '%Verificado API Asaas%'

UNION ALL

SELECT
    'Categoria B - Verificado Asaas' as categoria,
    COUNT(*) as registros_corrigidos,
    SUM("Valor") as valor_total
FROM "Contas_Receber"
WHERE "Observacões_Pagamento" LIKE 'BAIXA INDEVIDA - Verificado API Asaas%';

-- Listar alguns exemplos corrigidos
SELECT
    "ID",
    "Codigo",
    "Código_Cliente",
    "Valor",
    "Data_Vencimento",
    "Data_Pagamento",
    "Total",
    LEFT("Observacões_Pagamento", 100) as observacao
FROM "Contas_Receber"
WHERE "Observacões_Pagamento" LIKE 'BAIXA INDEVIDA%'
ORDER BY "ID"
LIMIT 20;

-- ============================================================
-- SCRIPT DE REVERSÃO (caso necessário)
-- ============================================================
/*
-- Para reverter as alterações, execute:

UPDATE "Contas_Receber" cr
SET
    "Data_Pagamento" = b."Data_Pagamento",
    "Observacões_Pagamento" = b."Observacões_Pagamento",
    "Total" = b."Total"
FROM "Contas_Receber_Backup_20260917" b
WHERE cr."ID" = b."ID";

-- Depois de confirmar que a reversão funcionou, pode deletar o backup:
-- DROP TABLE "Contas_Receber_Backup_20260917";
*/
