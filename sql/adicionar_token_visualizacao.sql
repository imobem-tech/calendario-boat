-- ============================================================
-- adicionar_token_visualizacao.sql — V.2610241950
-- Adiciona campo token_visualizacao em orcamento_servico
-- ============================================================

ALTER TABLE orcamento_servico
ADD COLUMN IF NOT EXISTS token_visualizacao VARCHAR(50) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orcamento_token
ON orcamento_servico(token_visualizacao);

COMMENT ON COLUMN orcamento_servico.token_visualizacao IS
'Token único para visualização pública do orçamento via link';

-- ============================================================
-- FIM — V.2610241950
-- ============================================================
