-- ============================================================
-- fix_previsao_duplicada.sql — V.2610020810
-- Criar tabela para controlar envios de previsão
-- Evita duplicatas mesmo com múltiplas instâncias
-- ============================================================

-- Tabela de controle de envios
CREATE TABLE IF NOT EXISTS public.wpp_previsao_enviada (
  id SERIAL PRIMARY KEY,
  grupowppid TEXT NOT NULL,
  data_envio DATE NOT NULL,
  hora_envio TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo'),
  tipo TEXT DEFAULT 'diaria', -- 'diaria' ou 'pos-agendamento'
  UNIQUE(grupowppid, data_envio, tipo)
);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_previsao_enviada_lookup
  ON public.wpp_previsao_enviada(grupowppid, data_envio, tipo);

-- Função para verificar se já enviou
CREATE OR REPLACE FUNCTION public.ja_enviou_previsao(
  p_grupowppid TEXT,
  p_data DATE,
  p_tipo TEXT DEFAULT 'diaria'
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.wpp_previsao_enviada
    WHERE grupowppid = p_grupowppid
      AND data_envio = p_data
      AND tipo = p_tipo
  );
END;
$$ LANGUAGE plpgsql;

-- Função para registrar envio (retorna TRUE se conseguiu, FALSE se já existe)
CREATE OR REPLACE FUNCTION public.registrar_envio_previsao(
  p_grupowppid TEXT,
  p_data DATE,
  p_tipo TEXT DEFAULT 'diaria'
) RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO public.wpp_previsao_enviada (grupowppid, data_envio, tipo)
  VALUES (p_grupowppid, p_data, p_tipo)
  ON CONFLICT (grupowppid, data_envio, tipo) DO NOTHING;

  -- Se inseriu (ROW_COUNT > 0), retorna TRUE
  -- Se já existia (ROW_COUNT = 0), retorna FALSE
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Comentários
COMMENT ON TABLE public.wpp_previsao_enviada IS
  'Controle de envios de previsão do tempo para evitar duplicatas entre múltiplas instâncias';

COMMENT ON FUNCTION public.ja_enviou_previsao IS
  'Verifica se já foi enviada previsão para um grupo em uma data específica';

COMMENT ON FUNCTION public.registrar_envio_previsao IS
  'Registra envio de previsão. Retorna TRUE se registrou, FALSE se já existia';
