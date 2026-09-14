-- ============================================================
-- TABELA: file_tokens
-- V.2609141720
-- Sistema de tokens para acesso seguro a arquivos
-- ============================================================

CREATE TABLE IF NOT EXISTS file_tokens (
  id SERIAL PRIMARY KEY,

  -- Token único (Nanoid - 21 caracteres)
  token VARCHAR(21) NOT NULL UNIQUE,

  -- Relacionamento
  lancamento_id INTEGER NOT NULL REFERENCES bank_extratos(id) ON DELETE CASCADE,
  empresa VARCHAR(10) NOT NULL,

  -- URLs dos arquivos protegidos
  file_urls TEXT[] NOT NULL,

  -- Metadados
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),

  -- Índices para busca rápida
  CONSTRAINT fk_lancamento FOREIGN KEY (lancamento_id) REFERENCES bank_extratos(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_file_tokens_token ON file_tokens(token);
CREATE INDEX IF NOT EXISTS idx_file_tokens_lancamento ON file_tokens(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_file_tokens_empresa ON file_tokens(empresa);

-- Comentários
COMMENT ON TABLE file_tokens IS 'Tokens para acesso seguro a arquivos de lançamentos bancários';
COMMENT ON COLUMN file_tokens.token IS 'Token único gerado com Nanoid (21 caracteres)';
COMMENT ON COLUMN file_tokens.lancamento_id IS 'ID do lançamento bancário';
COMMENT ON COLUMN file_tokens.file_urls IS 'Array com URLs dos arquivos protegidos';

-- ============================================================
-- FIM
-- ============================================================
