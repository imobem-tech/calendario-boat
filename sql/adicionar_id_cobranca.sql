-- ============================================================
-- adicionar_id_cobranca.sql — V.2610241730
-- Adiciona coluna id_cobranca na tabela orcamento_servico
-- ============================================================

ALTER TABLE orcamento_servico
ADD COLUMN IF NOT EXISTS id_cobranca INTEGER DEFAULT NULL;

COMMENT ON COLUMN orcamento_servico.id_cobranca IS 'Flag para indicar se cobrança foi gerada (1=sim, NULL=não)';

-- ============================================================
-- FIM — V.2610241730
-- ============================================================
