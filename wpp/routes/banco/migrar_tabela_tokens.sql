-- ============================================================
-- MIGRAÇÃO: file_tokens (novo modelo)
-- V.2609141800
-- Um token por extrato gerado (PDF), não por lançamento
-- ============================================================

-- Dropar tabela antiga (se existir)
DROP TABLE IF EXISTS file_tokens CASCADE;

-- Criar nova tabela
CREATE TABLE file_tokens (
  id SERIAL PRIMARY KEY,

  -- Token único (Nanoid - 21 caracteres)
  token VARCHAR(21) NOT NULL UNIQUE,

  -- Identificador do extrato (ex: "ALLMAX_2026-09", "TODAS_2026-09", "CONSOLIDADO_Q3")
  extrato_ref VARCHAR(100) NOT NULL,

  -- Descrição do PDF gerado
  descricao TEXT,

  -- Mapa completo: lancamento_id → array de arquivos
  -- Formato: { "174": [{"url": "...", "nome": "..."}], "172": [...] }
  todos_arquivos JSONB NOT NULL,

  -- Metadados
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

-- Índices
CREATE INDEX idx_file_tokens_token ON file_tokens(token);
CREATE INDEX idx_file_tokens_extrato_ref ON file_tokens(extrato_ref);
CREATE INDEX idx_file_tokens_created_at ON file_tokens(created_at DESC);

-- Comentários
COMMENT ON TABLE file_tokens IS 'Tokens para acesso seguro a arquivos de extratos bancários - UM token por PDF gerado';
COMMENT ON COLUMN file_tokens.token IS 'Token único gerado com Nanoid (21 caracteres)';
COMMENT ON COLUMN file_tokens.extrato_ref IS 'Identificador do extrato (ex: ALLMAX_2026-09, TODAS_2026-09)';
COMMENT ON COLUMN file_tokens.todos_arquivos IS 'JSONB com mapa lancamento_id → array de arquivos';

-- ============================================================
-- FIM
-- ============================================================
