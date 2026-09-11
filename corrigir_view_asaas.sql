-- ============================================================
-- corrigir_view_asaas.sql — V.2607211115
-- Corrige o filtro invertido da view vw_cob_pend_envio_asaas
--
-- PROBLEMA: View filtra por Alerta_Emite_Carta = false
-- CORRETO: Deve filtrar por Alerta_Emite_Carta = true
-- ============================================================

CREATE OR REPLACE VIEW public.vw_cob_pend_envio_asaas AS
SELECT
    cr."Boleto_Linha_Digitável",
    cr."Boleto_Conta",
    c."Cliente_ID_tab_6",
    c."Cliente_ID_tab_8",
    c."Cliente_ID_tab_9",
    CASE
        WHEN cr."Centro_Custo"::text = '8'::text THEN c."Cliente_ID_tab_8"
        WHEN cr."Centro_Custo"::text = '9'::text THEN c."Cliente_ID_tab_9"
        ELSE c."Cliente_ID_tab_6"
    END AS "Cliente_Asaas_ID_tab",
    cr."Codigo",
    cr."Centro_Custo",
    c."Outros_Email",
    c."Cliente_Nome",
    cr."Descrição",
    c."Cliente_CPF",
    to_char(cr."Data_Vencimento"::timestamp with time zone, 'YYYY-MM-DD'::text) AS "C_vencimento",
    cr."Valor" AS "C_valor",
    c."Cliente_Telefone_Celular" AS "C_celular",
    cr.agendamento_obs,
    cr."Portador",
    c."Alerta_Emite_Carta" AS "C_mandar_cob",
    cr."Data_Pagamento",
    cr."Data_Conta",
    cr."Código_Cliente"
FROM "Contas_Receber" cr
JOIN "Cliente" c ON c."Codigo" = cr."Código_Cliente"
WHERE cr."Centro_Custo"::text = ANY (ARRAY['6'::character varying, '8'::character varying, '9'::character varying]::text[])
  AND cr."Portador" IS NULL
  AND cr."Data_Pagamento" IS NULL
  AND c."Alerta_Emite_Carta" = true  -- ✅ CORRIGIDO: era false, agora é true
  AND cr."Data_Vencimento" >= CURRENT_DATE
  AND cr."Data_Vencimento" <= (CURRENT_DATE + COALESCE(c."Plano_Pgto"::integer, 7));

COMMENT ON VIEW public.vw_cob_pend_envio_asaas IS
'View de cobranças pendentes para envio ao Asaas.
CORRIGIDO em 21/07/2026: filtro Alerta_Emite_Carta invertido (era false, correto é true)';
