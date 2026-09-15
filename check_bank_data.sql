SELECT DISTINCT 
  empresa,
  banco,
  agencia,
  agencia_dv,
  conta,
  conta_dv
FROM lancamentos_bancarios 
WHERE banco = 'Asaas'
  AND agencia IS NOT NULL
ORDER BY empresa;
