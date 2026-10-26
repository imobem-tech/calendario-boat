-- Verificar rateio do orçamento ORC-261025152542

SELECT
  'ORCAMENTO' as tipo,
  numero,
  valor_total,
  status
FROM orcamento_servico
WHERE numero = 'ORC-261025152542';

SELECT
  'RATEIO' as tipo,
  r.id_rateio,
  a."Gropo_letra" as grupo,
  r.valor_cotista,
  r.participando,
  r.id_autorizado
FROM orcamento_rateio r
JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
WHERE r.id_orcamento = (SELECT id_orcamento FROM orcamento_servico WHERE numero = 'ORC-261025152542')
ORDER BY a."Gropo_letra", r.id_rateio;

SELECT
  'PREVIEW_QUERY' as tipo,
  a."Gropo_letra" as grupo_letra,
  SUM(r.valor_cotista) as valor_grupo,
  COUNT(*) as qtd_registros
FROM orcamento_rateio r
JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
WHERE r.id_orcamento = (SELECT id_orcamento FROM orcamento_servico WHERE numero = 'ORC-261025152542')
  AND r.participando = true
GROUP BY a."Gropo_letra"
ORDER BY a."Gropo_letra";
