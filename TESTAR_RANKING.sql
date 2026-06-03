-- ============================================================
-- TESTAR_RANKING.sql — V.2606022340
-- Insere 1 barco simulado que vai disparar ranking no espelho
-- Execute no Neon Console
-- ============================================================

-- Criar agendamento de teste (PB 999 para facilitar identificação)
INSERT INTO public."P_BOAT_z_10_Saida_Emb" (
  "Cod_Emb_PB",
  "Grupo_Comp_letra",
  "Dt_Agendamento",
  "Dt_Saída",
  "Cod_Autorizado",
  "Nome_Embarcacao"
) VALUES (
  999,
  'TS',
  NOW() AT TIME ZONE 'America/Sao_Paulo',
  NOW() AT TIME ZONE 'America/Sao_Paulo',
  1,
  'TESTE-RANKING'
)
RETURNING "ID";

-- Copie o ID retornado acima e substitua XXXX abaixo:

-- Inserir localização (65m da marina para disparar sistema 70m)
INSERT INTO public.wpp_localizacao_emb (
  agendamento_id,
  pb,
  cota,
  latitude,
  longitude,
  velocidade_kmh,
  distancia_porto_m,
  criado_em
) VALUES (
  XXXX,  -- <-- SUBSTITUA pelo ID do agendamento
  999,
  'TS',
  -10.21095,  -- ~65m da marina
  -48.36912,
  25.5,
  65,
  NOW() AT TIME ZONE 'America/Sao_Paulo'
);

-- Verificar inserção
SELECT
  l.pb,
  l.cota,
  l.distancia_porto_m,
  s."Nome_Embarcacao",
  l.criado_em
FROM public.wpp_localizacao_emb l
JOIN public."P_BOAT_z_10_Saida_Emb" s ON s."ID" = l.agendamento_id
WHERE l.pb = 999;

-- RESULTADO ESPERADO:
-- 1. Dispara ranking no grupo espelho (via atualizarRankingEmTodosGrupos)
-- 2. Sistema 70m detecta barco <70m
-- 3. Envia pergunta de confirmação S/N (em 5min no próximo ciclo)

-- LIMPAR DEPOIS:
-- DELETE FROM public.wpp_localizacao_emb WHERE pb = 999;
-- DELETE FROM public."P_BOAT_z_10_Saida_Emb" WHERE "Cod_Emb_PB" = 999;
