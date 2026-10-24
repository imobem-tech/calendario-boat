-- ============================================================
-- MIGRAÇÃO: Adicionar colunas em orcamento_anexo — V.2610241557
-- ============================================================

-- Adicionar nome_amigavel
ALTER TABLE orcamento_anexo
ADD COLUMN IF NOT EXISTS nome_amigavel VARCHAR(255);

-- Adicionar visivel_cliente
ALTER TABLE orcamento_anexo
ADD COLUMN IF NOT EXISTS visivel_cliente BOOLEAN DEFAULT true;

-- Renomear coluna tipo para tipo_arquivo (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orcamento_anexo' AND column_name = 'tipo_arquivo'
  ) THEN
    ALTER TABLE orcamento_anexo RENAME COLUMN tipo TO tipo_arquivo;
  END IF;
END $$;

-- Alterar usuario_upload para VARCHAR(50)
ALTER TABLE orcamento_anexo
ALTER COLUMN usuario_upload TYPE VARCHAR(50) USING usuario_upload::VARCHAR;

-- Adicionar índices se não existirem
CREATE INDEX IF NOT EXISTS idx_orcamento_anexo_orcamento
ON orcamento_anexo(id_orcamento);

CREATE INDEX IF NOT EXISTS idx_orcamento_anexo_visivel
ON orcamento_anexo(id_orcamento, visivel_cliente);

-- Atualizar valores NULL para padrão
UPDATE orcamento_anexo
SET visivel_cliente = true
WHERE visivel_cliente IS NULL;

UPDATE orcamento_anexo
SET nome_amigavel = nome_arquivo
WHERE nome_amigavel IS NULL;

-- ============================================================
-- FIM — V.2610241557
-- ============================================================
