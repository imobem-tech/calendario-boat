-- ============================================================
-- Tabelas para localização em tempo real e ranking de retorno
-- V.2606021250
-- ============================================================

-- Tabela de posições recebidas via WhatsApp
CREATE TABLE IF NOT EXISTS public.wpp_localizacao_emb (
  id SERIAL PRIMARY KEY,
  agendamento_id INT,
  pb INT,
  cota TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  distancia_porto_m INT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_loc_agendamento ON public.wpp_localizacao_emb(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_loc_criado ON public.wpp_localizacao_emb(criado_em DESC);

-- Tabela para guardar messageKey do ranking (para editar a mesma mensagem)
CREATE TABLE IF NOT EXISTS public.wpp_ranking_msg (
  grupo_id TEXT PRIMARY KEY,
  message_id TEXT,
  message_key JSONB,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE public.wpp_localizacao_emb IS 'Histórico de posições recebidas via compartilhamento de localização em tempo real';
COMMENT ON TABLE public.wpp_ranking_msg IS 'MessageKeys das mensagens de ranking para permitir edição';

-- ============================================================
-- V.2606021250
-- ============================================================
