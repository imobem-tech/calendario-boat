-- ============================================================
-- SQL: Criar tabela orcamento_anexo — V.2610241535
-- Sistema de anexos para orçamentos
-- ============================================================

CREATE TABLE IF NOT EXISTS orcamento_anexo (
  id_anexo SERIAL PRIMARY KEY,
  id_orcamento INTEGER NOT NULL REFERENCES orcamento_servico(id_orcamento) ON DELETE CASCADE,
  nome_amigavel VARCHAR(255) NOT NULL,      -- Nome dado pelo usuário
  nome_arquivo VARCHAR(500) NOT NULL,        -- Nome técnico no storage
  url_arquivo TEXT NOT NULL,                 -- URL do Vercel Blob
  visivel_cliente BOOLEAN DEFAULT true,      -- true = cliente vê, false = só gestores
  tipo_arquivo VARCHAR(50),                  -- Extensão/MIME type
  tamanho INTEGER,                           -- Bytes
  data_upload TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo'),
  usuario_upload VARCHAR(50)                 -- Telefone WhatsApp (11 dígitos)
);

-- Índice para busca rápida por orçamento
CREATE INDEX idx_orcamento_anexo_orcamento ON orcamento_anexo(id_orcamento);

-- Índice para filtrar por visibilidade
CREATE INDEX idx_orcamento_anexo_visivel ON orcamento_anexo(id_orcamento, visivel_cliente);

-- ============================================================
-- FIM
-- ============================================================
