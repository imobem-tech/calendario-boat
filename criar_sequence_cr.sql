-- ============================================================
-- CORREÇÃO BUG: Race Condition em Contas_Receber
-- Data: 18/09/2026
-- ============================================================
--
-- PROBLEMA:
-- - MAX(Codigo) + 1 não é thread-safe
-- - VBA e Node.js geravam códigos duplicados simultaneamente
-- - 481 contas afetadas em 2026
--
-- SOLUÇÃO:
-- - SEQUENCE gera números únicos atomicamente
-- - FUNCTION centraliza a lógica
-- - VBA e Node.js usam a mesma function
--
-- ============================================================

-- 1. Criar SEQUENCE começando em 58271 (próximo após último código usado)
CREATE SEQUENCE IF NOT EXISTS contas_receber_codigo_seq
START WITH 58271
INCREMENT BY 1
NO CYCLE;

-- 2. Criar FUNCTION que retorna próximo código
CREATE OR REPLACE FUNCTION gerar_proximo_codigo_cr()
RETURNS INTEGER AS $$
BEGIN
    RETURN nextval('contas_receber_codigo_seq');
END;
$$ LANGUAGE plpgsql;

-- 3. Verificar criação
SELECT
    'SEQUENCE criada' as status,
    last_value as proximo_codigo
FROM contas_receber_codigo_seq;

SELECT
    'FUNCTION criada' as status,
    gerar_proximo_codigo_cr() as teste_codigo;

-- ============================================================
-- ROLLBACK (caso necessário reverter):
-- DROP FUNCTION IF EXISTS gerar_proximo_codigo_cr();
-- DROP SEQUENCE IF EXISTS contas_receber_codigo_seq;
-- ============================================================
