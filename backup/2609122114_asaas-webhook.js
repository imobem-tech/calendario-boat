// ============================================================
// ⚠️ BACKUP: 2609122114_asaas-webhook.js
// Data do backup: 12/09/2026 21:14
// Arquivo original: wpp/routes/banco/asaas-webhook.js — V.260912120000
// ============================================================
//
// MOTIVO DO BACKUP:
// Correção do erro 400 no webhook Extratos_Bancarios da SUMMER
//
// PROBLEMA RESOLVIDO:
// - Webhook Extratos_Bancarios retornava erro 400 Bad Request
// - Validação obrigatória de evento.payment rejeitava webhooks de extrato
// - Webhooks de extrato bancário não têm objeto 'payment', têm estrutura diferente
//
// FUNÇÕES ALTERADAS:
// - handleAsaasWebhook(): Validação flexível de estrutura
//   - Removida validação obrigatória de evento.payment
//   - Adicionado suporte para webhooks sem payment
//   - Adicionado log detalhado do corpo da requisição
//   - Tratamento de estruturas alternativas (movement, transfer, bill, etc)
//
// SOLUÇÃO:
// - Validar apenas evento.event (obrigatório)
// - Aceitar diferentes estruturas de dados
// - Extrair dados de payment || movement || transfer || bill || pix
// - Log completo para debugging
//
// ============================================================

// [ARQUIVO ORIGINAL PRESERVADO - CONTEÚDO OMITIDO PARA BREVIDADE]
