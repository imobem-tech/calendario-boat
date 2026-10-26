// ============================================================
// ⚠️ BACKUP: 2606170920_saida.js
// Data do backup: 17/06/2026 09:20
// Arquivo original: C:\Users\NOTEBOOK\projetos\calendario_allmax\wpp\comandos\saida.js — V.2606010918
// ============================================================
//
// MOTIVO DO BACKUP:
// Corrigir mensagem "Encontrei mais de uma saída para hoje" quando há múltiplos agendamentos
//
// PROBLEMA RESOLVIDO:
// - Query buscarSaidaDoDia() retornava TODOS os agendamentos do dia, incluindo cancelados/desistidos
// - Bot mostrava erro mesmo quando havia apenas 1 saída VÁLIDA
// - Comportamento anterior incorreto para casos com saída válida + saída cancelada no mesmo dia
//
// FUNÇÕES ALTERADAS:
// - buscarSaidaDoDia(): adicionados filtros na query
//   - AND "Dt_Desistencia" IS NULL
//   - AND "Dt_Cancela_saida" IS NULL
//   - Agora retorna apenas saídas VÁLIDAS (não canceladas/desistidas)
//
// - iniciarFluxoSaida(): removidas validações redundantes
//   - Validações de Dt_Desistencia e Dt_Cancela_saida já feitas pela query
//   - Código mais limpo e sem verificações duplicadas
//
// SOLUÇÃO:
// - Query filtra na origem, retorna apenas registros válidos
// - Mensagem "mais de uma saída" só aparece se realmente houver duplicidade válida
// - Versão atualizada para V.2606170920
//
// ============================================================
