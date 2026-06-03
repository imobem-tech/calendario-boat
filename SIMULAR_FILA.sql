-- ============================================================
-- SIMULAR_FILA.sql — V.2606022315
-- Insere 20 barcos simulados entre 20-100m da marina
-- Execute no Neon Console ou pgAdmin
-- ============================================================

-- Marina: -10.21101, -48.36912

-- Limpar simulações anteriores (PB 100-119)
DELETE FROM public.wpp_localizacao_emb WHERE pb >= 100 AND pb < 120;
DELETE FROM public."P_BOAT_z_10_Saida_Emb" WHERE "Cod_Emb_PB" >= 100 AND "Cod_Emb_PB" < 120;

-- Inserir 20 barcos com agendamento + localização
DO $$
DECLARE
  v_ag_id INTEGER;
  v_pb INTEGER;
  v_cota TEXT;
  v_lat NUMERIC;
  v_lon NUMERIC;
  v_dist INTEGER;
  v_vel NUMERIC;
  v_bearing NUMERIC;
  v_R CONSTANT NUMERIC := 6371000; -- raio Terra em metros
BEGIN
  FOR i IN 0..19 LOOP
    v_pb := 100 + i;
    v_cota := CASE WHEN i % 2 = 0 THEN 'X' || (i + 1) ELSE NULL END;
    v_dist := 20 + FLOOR(RANDOM() * 80); -- 20-100m
    v_vel := 10 + (RANDOM() * 30); -- 10-40 km/h
    v_bearing := RANDOM() * 360; -- direção aleatória em graus

    -- Calcular lat/lon a partir de distância e bearing (fórmula Haversine reversa)
    v_lat := -10.21101 + (v_dist * COS(RADIANS(v_bearing))) / 111320.0;
    v_lon := -48.36912 + (v_dist * SIN(RADIANS(v_bearing))) / (111320.0 * COS(RADIANS(-10.21101)));

    -- Criar agendamento
    INSERT INTO public."P_BOAT_z_10_Saida_Emb" (
      "Cod_Emb_PB",
      "Grupo_Comp_letra",
      "Dt_Agendamento",
      "Dt_Saída",
      "Cod_Autorizado",
      "Nome_Embarcacao"
    ) VALUES (
      v_pb,
      v_cota,
      NOW() AT TIME ZONE 'America/Sao_Paulo',
      NOW() AT TIME ZONE 'America/Sao_Paulo',
      1,
      'SIMUL-' || v_pb || COALESCE(v_cota, '')
    )
    RETURNING "ID" INTO v_ag_id;

    -- Inserir localização
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
      v_ag_id,
      v_pb,
      v_cota,
      v_lat,
      v_lon,
      v_vel,
      v_dist,
      NOW() AT TIME ZONE 'America/Sao_Paulo'
    );

    RAISE NOTICE '✅ %-%: %m (%km/h)', v_pb, COALESCE(v_cota, '?'), v_dist, ROUND(v_vel, 1);
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '🎉 20 BARCOS SIMULADOS!';
  RAISE NOTICE '🗺️  MAPA: https://calendario-boat-production.up.railway.app/rastrear.html';
END $$;

-- Verificar inserção
SELECT
  l.pb,
  l.cota,
  l.distancia_porto_m,
  ROUND(l.velocidade_kmh::NUMERIC, 1) as vel_kmh,
  s."Nome_Embarcacao"
FROM public.wpp_localizacao_emb l
JOIN public."P_BOAT_z_10_Saida_Emb" s ON s."ID" = l.agendamento_id
WHERE l.pb >= 100 AND l.pb < 120
ORDER BY l.distancia_porto_m;
