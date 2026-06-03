-- ============================================================
-- LIMPAR_SIMULACAO.sql — V.2606022315
-- Remove barcos simulados (PB 100-119)
-- ============================================================

DELETE FROM public.wpp_localizacao_emb
WHERE pb >= 100 AND pb < 120;

DELETE FROM public."P_BOAT_z_10_Saida_Emb"
WHERE "Cod_Emb_PB" >= 100 AND "Cod_Emb_PB" < 120;

SELECT '✅ SIMULAÇÃO LIMPA!' as resultado;
