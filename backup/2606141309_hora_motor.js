// ============================================================
// ⚠️ BACKUP: 2606141309_hora_motor.js
// Data do backup: 14/06/2026 13:09
// Arquivo original: C:\Users\NOTEBOOK\projetos\calendario_allmax\wpp\comandos\hora_motor.js — V.2606051920
// ============================================================
//
// MOTIVO DO BACKUP:
// Implementar exceção de cobrança para cliente ALLMAX (código 4138)
//
// PROBLEMA RESOLVIDO:
// - Sistema gerava cobrança automática para todos os clientes após HM retorno
// - Cliente 4138 (ALLMAX) não deve ser cobrado por hora motor
//
// FUNÇÕES ALTERADAS:
// - gerarCobrancaHoraMotor(): adicionada validação do cod_cliente === 4138
//   - Se 4138: apenas informa "Não gerado Conta a Receber, cliente ALLMAX"
//   - Se outros: mantém fluxo normal de cobrança CR + Asaas
//
// SOLUÇÃO:
// - Verificação do codCliente logo após extração do Cod_Autorizado
// - Return antecipado com mensagem específica sem gerar CR/Asaas
// - Atualização da versão para V.2606141309
//
// ============================================================
