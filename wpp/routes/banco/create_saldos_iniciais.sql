-- ============================================================
-- CREATE TABLE: bank_saldos_iniciais
-- Armazena saldos iniciais para sincronização com extrato real
-- Data: 18/09/2026
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_saldos_iniciais (
  id SERIAL PRIMARY KEY,
  empresa VARCHAR(50) NOT NULL,
  banco VARCHAR(50) NOT NULL,
  data_referencia DATE NOT NULL,
  saldo_informado DECIMAL(12,2) NOT NULL,
  observacao TEXT,
  usuario VARCHAR(100),
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Índice único para evitar duplicatas na mesma data
CREATE UNIQUE INDEX IF NOT EXISTS idx_saldo_unico
ON bank_saldos_iniciais(empresa, banco, data_referencia);

-- Índice para busca rápida do último saldo
CREATE INDEX IF NOT EXISTS idx_saldo_busca
ON bank_saldos_iniciais(empresa, banco, data_referencia DESC);

-- Comentários
COMMENT ON TABLE bank_saldos_iniciais IS 'Saldos iniciais para sincronização com extrato bancário real';
COMMENT ON COLUMN bank_saldos_iniciais.empresa IS 'ALLMAX, IMOBEM, SUMMER, IMOBAN';
COMMENT ON COLUMN bank_saldos_iniciais.banco IS 'Asaas, Sicredi, etc';
COMMENT ON COLUMN bank_saldos_iniciais.data_referencia IS 'Data do saldo informado';
COMMENT ON COLUMN bank_saldos_iniciais.saldo_informado IS 'Saldo real do banco nesta data';
COMMENT ON COLUMN bank_saldos_iniciais.observacao IS 'Motivo do ajuste: Ajuste inicial, Correção duplicata, etc';
COMMENT ON COLUMN bank_saldos_iniciais.usuario IS 'Email do usuário que fez o ajuste';

-- ============================================================
-- EXEMPLO DE USO:
-- ============================================================
-- INSERT INTO bank_saldos_iniciais (empresa, banco, data_referencia, saldo_informado, observacao, usuario)
-- VALUES ('ALLMAX', 'Asaas', '2026-09-01', 15342.50, 'Ajuste inicial - sincronização', 'daniel@allmax.com');
-- ============================================================
