-- ============================================================
-- Corrigir ordenação das views de saída
-- V.2606041350
-- Mudança: Dt_Agendamento, Dt_Saída → Dt_Saída, Dt_Agendamento
-- ============================================================

-- ============================================================
-- View 1: vw_saida_emb_abertas_agenda
-- Saídas abertas agendadas até amanhã (+2 dias)
-- ============================================================

CREATE OR REPLACE VIEW public.vw_saida_emb_abertas_agenda AS
SELECT
  s."Grupo_Comp_letra",
  s."ID",
  c1."ID" AS "ID_CLIENTE",
  s."ID" AS "ID_SAIDA",
  e."Código",
  c1."Codigo" AS "Cod_cliente",
  s."Cod_Autorizado" AS "Codigo_Autorizado",
  e."Nome_Embar",
  e."Marca",
  e."Modelo",
  s."Código" AS "Codigo_Saida",
  s."Cod_Emb_PB",
  c1."Cliente_Nome" AS "Cliente_Titular",
  c2."Cliente_Nome" AS "Autorizado",
  s."Dt_Saída",
  s."Dt_Agendamento",
  e."Tipo_Embar",
  e."Pés",
  s."Colab_Responsavel",
  CASE
    WHEN (s."Dt_Saída" IS NULL) THEN 1
    ELSE 0
  END AS "N_Saiu",
  e."Plano_Contrato"
FROM "P_BOAT_z_10_Saida_Emb" s
  LEFT JOIN "Cliente" c1 ON s."Cod_Proprietário" = c1."Codigo"::double precision
  LEFT JOIN "Cliente" c2 ON s."Cod_Autorizado" = c2."Codigo"::double precision
  LEFT JOIN "P_BOAT_1_Embarcacao" e ON s."Cod_Emb_PB" = e."Num_PB"
WHERE
  s."Dt_Agendamento" < (CURRENT_DATE + INTERVAL '2 days')
  AND s."Dt_Retorno" IS NULL
  AND s."Dt_Desistencia" IS NULL
ORDER BY s."Dt_Saída" NULLS FIRST, s."Dt_Agendamento";

-- ============================================================
-- View 2: vw_saida_emb_abertas_todas
-- Todas as saídas abertas (sem filtro de data)
-- ============================================================

CREATE OR REPLACE VIEW public.vw_saida_emb_abertas_todas AS
SELECT
  s."Grupo_Comp_letra",
  s."ID",
  c1."ID" AS "ID_CLIENTE",
  s."ID" AS "ID_SAIDA",
  e."Código",
  c1."Codigo" AS "Cod_cliente",
  s."Cod_Autorizado" AS "Codigo_Autorizado",
  e."Nome_Embar",
  e."Marca",
  e."Modelo",
  s."Código" AS "Codigo_Saida",
  s."Cod_Emb_PB",
  c1."Cliente_Nome" AS "Cliente_Titular",
  c2."Cliente_Nome" AS "Autorizado",
  s."Dt_Saída",
  s."Dt_Agendamento",
  e."Tipo_Embar",
  e."Pés",
  s."Colab_Responsavel",
  CASE
    WHEN (s."Dt_Saída" IS NULL) THEN 1
    ELSE 0
  END AS "N_Saiu",
  e."Plano_Contrato"
FROM "P_BOAT_z_10_Saida_Emb" s
  LEFT JOIN "Cliente" c1 ON s."Cod_Proprietário" = c1."Codigo"::double precision
  LEFT JOIN "Cliente" c2 ON s."Cod_Autorizado" = c2."Codigo"::double precision
  LEFT JOIN "P_BOAT_1_Embarcacao" e ON s."Cod_Emb_PB" = e."Num_PB"
WHERE
  s."Dt_Retorno" IS NULL
  AND s."Dt_Desistencia" IS NULL
ORDER BY s."Dt_Saída" NULLS FIRST, s."Dt_Agendamento";

-- ============================================================
-- FIM
-- ============================================================

-- NOTA: Usando NULLS FIRST para garantir que NULL apareça primeiro
-- Resultado: NULL (agendados) → depois datas crescentes (já saíram)
