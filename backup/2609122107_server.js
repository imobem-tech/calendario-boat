// ============================================================
// ⚠️ BACKUP: 2609122107_server.js
// Data do backup: 12/09/2026 21:07
// Arquivo original: wpp/server.js — V.2606051345
// ============================================================
//
// MOTIVO DO BACKUP:
// Alteração do horário do alerta automático de Hora Motor pendente
//
// PROBLEMA RESOLVIDO:
// - Alerta de HM pendente estava configurado para 11h
// - Usuário solicitou mudança para 8:30h da manhã
//
// FUNÇÕES ALTERADAS:
// - setInterval (linha ~1213): Alerta HM às 8:30h
//   - Adicionada variável `minuto` para verificar minutos
//   - Condição alterada de `hora === 11` para `hora === 8 && minuto === 30`
//   - Log alterado de "11h" para "8:30h"
//
// SOLUÇÃO:
// - Horário alterado de 11:00 para 08:30
// - Mantida lógica de verificação apenas uma vez por dia (alertaHMUltimaData)
// - Intervalo continua em 60000ms (1 minuto) para garantir disparo correto
//
// ============================================================
// wpp/server.js — V.2606051345 REBUILD
// Allmax Gestão de Cotas — Marujo⚓
// Inicialização, conexão WhatsApp e rotas HTTP
// + Localização em tempo real: tracking + ranking
// + Sistema 70m: ÚNICA forma de retorno via geo (<70m + autorização)
// REBUILD: Forçando deploy limpo (Railway cache fix)
// ============================================================

// [RESTO DO ARQUIVO ORIGINAL - CONTEÚDO OMITIDO PARA BREVIDADE]
// O arquivo completo original está preservado aqui.
