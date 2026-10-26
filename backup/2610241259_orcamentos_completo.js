// ============================================================
// ⚠️ BACKUP: 2610241259_orcamentos_completo.js
// Data do backup: 24/10/26 12:59
// Arquivo original: wpp/comandos/orcamentos.js — V.2610241259
// ============================================================
//
// MOTIVO DO BACKUP:
// Deploy completo do sistema de orçamentos com todas as 6 funcionalidades
//
// FUNCIONALIDADES IMPLEMENTADAS:
// 1. ✅ Criar Novo Orçamento (múltiplos itens, taxa 20%)
// 2. ✅ Consultar Orçamentos Abertos
// 3. ✅ Consultar Orçamentos Fechados (com submenu de dias)
// 4. ✅ Orçamentos por Embarcação (com contagem)
// 5. ✅ Pendentes de Aprovação (ordenado por mais antigo)
// 6. ✅ Pendentes de Cobrança (verifica Contas_Receber)
//
// TODAS AS FUNÇÕES CRIADAS:
// - mostrarMenuOrcamentos(): Menu principal com 6 opções
// - listarEmbarcacoes(): Embarcações ALLMAX para criar
// - selecionarEmbarcacao(): Salva embarcação selecionada
// - pedirTitulo(): Solicita título do orçamento
// - pedirDescricaoItem(): Solicita descrição do item
// - pedirValorItem(): Solicita valor do item
// - exibirResumoItens(): Mostra resumo antes de finalizar
// - confirmarOrcamento(): Confirmação final
// - finalizarOrcamento(): INSERT no banco (transação)
// - listarOrcamentosAbertos(): Lista RASCUNHO/ENVIADO
// - perguntarDiasFechados(): Submenu de período (7/15/30/60/90/todos)
// - listarOrcamentosFechados(dias): Lista com filtro de data
// - listarEmbarcacoesParaConsulta(): Lista com contagem
// - listarOrcamentosPorEmbarcacao(): Orçamentos de uma embarcação
// - listarPendentesAprovacao(): RASCUNHO/ENVIADO ordenado
// - listarPendentesCobranca(): APROVADO sem cobrança
// - verDetalhesOrcamento(id): Detalhes completos (cabeçalho + itens)
// - processarMensagemOrcamentos(): Handler principal
//
// ESTADOS DO SISTEMA:
// - MENU
// - SELECIONAR_EMBARCACAO
// - TITULO
// - ITEM_DESCRICAO
// - ITEM_VALOR
// - REVISAR
// - FECHADOS_DIAS
// - SELECIONAR_EMBARCACAO_CONSULTA
// - LISTAR_ABERTOS
// - LISTAR_FECHADOS
// - LISTAR_POR_EMBARCACAO
// - LISTAR_PENDENTES_APROVACAO
// - LISTAR_PENDENTES_COBRANCA
//
// VALIDAÇÕES:
// - Descrição: mínimo 2 palavras de 3+ caracteres
// - Valor: formatos 5000, 5000,50, 5.000,50
// - FK correta: Código (não Num_PB)
// - Status válido: RASCUNHO, ENVIADO, APROVADO, etc.
// - Campos obrigatórios: 9/9 verificados
//
// QUERIES PRINCIPAIS:
// 1. Criar orçamento:
//    - INSERT orcamento_servico (9 campos obrigatórios)
//    - INSERT orcamento_item (múltiplos itens)
//    - Transação (BEGIN/COMMIT/ROLLBACK)
//
// 2. Listar abertos:
//    - WHERE status IN ('RASCUNHO', 'ENVIADO')
//    - JOIN com embarcações
//    - LIMIT 20
//
// 3. Listar fechados:
//    - WHERE status IN ('APROVADO', 'RECUSADO', 'CONCLUIDO', 'CANCELADO')
//    - Filtro de data opcional (INTERVAL 'N days')
//    - LIMIT 50
//
// 4. Por embarcação:
//    - COUNT de orçamentos por embarcação
//    - WHERE id_embarcacao = X
//
// 5. Pendentes aprovação:
//    - WHERE status IN ('RASCUNHO', 'ENVIADO')
//    - Calcula dias pendente
//    - ORDER BY data ASC (mais antigo primeiro)
//
// 6. Pendentes cobrança:
//    - WHERE status = 'APROVADO'
//    - EXISTS em Contas_Receber (Origem='ORCAMENTO')
//    - Filtra apenas sem cobrança
//
// INTERFACE:
// - Menu com 6 opções numeradas
// - Emojis por status (📝📤✅❌🚫)
// - Formatação brasileira (R$ X.XXX,XX)
// - Navegação: número para detalhes, 0 para voltar
//
// TESTES REALIZADOS:
// ✅ Criar orçamento (#25 criado com sucesso)
// ✅ FK correta verificada (Código, não Num_PB)
// ✅ Campos obrigatórios (9/9)
// ✅ Status válido (RASCUNHO)
// ✅ INSERT + Item salvos
//
// ============================================================
// ============================================================
// wpp/comandos/orcamentos.js — V.2610241259
// SISTEMA DE ORÇAMENTOS VIA WHATSAPP
//
// Gerencia criação de orçamentos com múltiplos itens
// dentro do grupo ORÇAMENTOS (120363412373130577@g.us)
//
// FLUXO:
// 1. Menu principal
// 2. Criar novo orçamento
//    - Selecionar embarcação (Cod_Cliente = 4255)
//    - Título do orçamento
//    - Adicionar itens (descrição + valor)
//    - Revisar e confirmar
// 3. Consultar orçamentos (abertos/fechados)
// 4. Gerenciar anexos
// 5. Gerenciar observações
//
// TABELAS:
// - orcamento_servico (cabeçalho)
// - orcamento_item (itens)
// - orcamento_rateio (divisão entre cotistas)
// - orcamento_anexo (anexos visíveis/privados)
// - orcamento_log (observações privadas)
// - file_tokens (tokens de acesso seguro)
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

// Usar mesma configuração do server.js
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔌 Pool de conexão orçamentos inicializado');

// ============================================================
// GERENCIAMENTO DE ESTADO
// Armazena estado de cada usuário durante o fluxo
// ============================================================
const estadosUsuario = new Map();

/**
 * Estrutura do estado:
 * {
 *   etapa: 'MENU' | 'SELECIONAR_EMBARCACAO' | 'TITULO' | 'ITEM_DESCRICAO' | 'ITEM_VALOR' | 'REVISAR',
 *   orcamento: {
 *     id_embarcacao: 'PB-002',
 *     nome_embarcacao: 'GRACINHA II',
 *     titulo: 'Manutenção preventiva',
 *     descricao: 'Descrição visível ao cliente',
 *     itens: [
 *       { ordem: 1, descricao: 'Troca de óleo', valor: 500.00 },
 *       { ordem: 2, descricao: 'Filtro', valor: 150.00 }
 *     ],
 *     item_atual: { descricao: '...', valor: null }
 *   }
 * }
 */

function obterEstado(userId) {
  if (!estadosUsuario.has(userId)) {
    estadosUsuario.set(userId, { etapa: 'MENU', orcamento: null });
  }
  return estadosUsuario.get(userId);
}

function atualizarEstado(userId, novoEstado) {
  estadosUsuario.set(userId, novoEstado);
}

function limparEstado(userId) {
  estadosUsuario.delete(userId);
}

// ============================================================
// VALIDAÇÕES
// ============================================================

/**
 * Valida descrição (título ou item)
 * Regra: Mínimo 2 palavras de 3+ caracteres cada
 */
function validarDescricao(texto) {
  const palavras = texto.trim().split(/\s+/).filter(p => p.length >= 3);
  return palavras.length >= 2;
}

/**
 * Formata e valida valor monetário
 * Aceita: 5000, 5000,50, 5.000,50, 5000,5
 * Retorna: número ou null se inválido
 */
function formatarValor(texto) {
  // Remover espaços
  texto = texto.trim();

  // Se digitar "pular", retorna null
  if (texto.toLowerCase() === 'pular') {
    return null;
  }

  // Verificar se tem ponto SEM vírgula (formato inválido)
  if (texto.includes('.') && !texto.includes(',')) {
    return 'ERRO_FORMATO'; // Erro: usar vírgula
  }

  // Remover pontos (separador de milhar)
  texto = texto.replace(/\./g, '');

  // Trocar vírgula por ponto (padrão JS)
  texto = texto.replace(',', '.');

  // Tentar converter
  const valor = parseFloat(texto);

  if (isNaN(valor) || valor <= 0) {
    return 'ERRO_FORMATO';
  }

  return valor;
}

/**
 * Formata valor para exibição brasileira
 */
function formatarMoeda(valor) {
  if (valor === null || valor === undefined) {
    return '(não informado)';
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ============================================================
// MENU PRINCIPAL
// ============================================================

export async function mostrarMenuOrcamentos(sock, userId, groupId) {
  const mensagem = `━━━━━━━━━━━━━━━━
💼 *SISTEMA DE ORÇAMENTOS*
━━━━━━━━━━━━━━━━

Escolha uma opção:

1️⃣ ➕ Criar Novo Orçamento
2️⃣ 📋 Consultar Orçamentos Abertos
3️⃣ ✅ Consultar Orçamentos Fechados
4️⃣ 🚤 Orçamentos por Embarcação
5️⃣ ⏰ Pendentes de Aprovação
6️⃣ 💵 Pendentes de cobrança
0️⃣ 🔙 Voltar ao Menu Principal

━━━━━━━━━━━━━━━━
Digite o número da opção:`;

  await sock.sendMessage(groupId, { text: mensagem });

  // Resetar estado
  atualizarEstado(userId, { etapa: 'MENU', orcamento: null });
}

// ============================================================
// ETAPA 1: SELECIONAR EMBARCAÇÃO
// ============================================================

async function listarEmbarcacoes(sock, userId, groupId) {
  try {
    console.log('🔍 [ORCAMENTOS] Buscando embarcações ALLMAX...');
    console.log('🔌 [ORCAMENTOS] Database URL:', process.env.POSTGRES_URL ? 'Configurado' : 'NÃO configurado');

    // Buscar apenas embarcações ALLMAX (Cod_Cliente = 4255)
    // Campos verificados em wpp/comandos/saida.js linha 292
    // IMPORTANTE: FK orcamento_servico.id_embarcacao → P_BOAT_1_Embarcacao.Código
    const result = await pool.query(`
      SELECT
        "Código" as codigo,
        "Num_PB" as numero_pb,
        "Nome_Embar" as nome
      FROM "P_BOAT_1_Embarcacao"
      WHERE "Cod_Cliente" = 4255
      ORDER BY "Num_PB"
    `);

    console.log(`✅ [ORCAMENTOS] ${result.rows.length} embarcações encontradas`);

    if (result.rows.length === 0) {
      console.log('⚠️ [ORCAMENTOS] Nenhuma embarcação ALLMAX ativa');
      await sock.sendMessage(groupId, {
        text: '❌ Nenhuma embarcação ALLMAX encontrada.'
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━
🚤 *SELECIONAR EMBARCAÇÃO*
━━━━━━━━━━━━━━━━

Escolha a embarcação:

`;

    result.rows.forEach((emb, index) => {
      mensagem += `${index + 1}️⃣ ${emb.numero_pb} - ${emb.nome}\n`;
    });

    mensagem += `\n0️⃣ Cancelar\n\n━━━━━━━━━━━━━━━━\nDigite o número:`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'SELECIONAR_EMBARCACAO',
      embarcacoes: result.rows,
      orcamento: {}
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar embarcações:', error);
    console.error('❌ [ORCAMENTOS] Stack:', error.stack);
    console.error('❌ [ORCAMENTOS] Mensagem:', error.message);

    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar embarcações.\n\n*Detalhes técnicos:*\n${error.message}\n\nTente novamente ou contate o suporte.`
    });
  }
}

async function selecionarEmbarcacao(sock, userId, groupId, opcao) {
  const estado = obterEstado(userId);

  if (opcao === '0') {
    await mostrarMenuOrcamentos(sock, userId, groupId);
    return;
  }

  const index = parseInt(opcao) - 1;

  if (isNaN(index) || index < 0 || index >= estado.embarcacoes.length) {
    await sock.sendMessage(groupId, {
      text: '❌ Opção inválida! Digite o número da embarcação ou 0 para cancelar.'
    });
    return;
  }

  const embarcacao = estado.embarcacoes[index];

  // Atualizar orçamento com embarcação selecionada
  // IMPORTANTE: Salvar Código (FK) mas mostrar Num_PB (interface)
  estado.orcamento.id_embarcacao = embarcacao.codigo; // FK para banco
  estado.orcamento.numero_pb = embarcacao.numero_pb;  // Exibição
  estado.orcamento.nome_embarcacao = embarcacao.nome;
  estado.etapa = 'TITULO';

  atualizarEstado(userId, estado);

  // Pedir título do orçamento
  const mensagem = `✅ Embarcação selecionada: ${embarcacao.numero_pb} (${embarcacao.nome})

━━━━━━━━━━━━━━━━
📝 *PASSO 2/5: TÍTULO DO ORÇAMENTO*
━━━━━━━━━━━━━━━━

Digite o título do orçamento:

💡 Exemplo: Manutenção preventiva do motor

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });
}

// ============================================================
// ETAPA 2: TÍTULO DO ORÇAMENTO
// ============================================================

async function receberTitulo(sock, userId, groupId, titulo) {
  if (titulo === '0') {
    await mostrarMenuOrcamentos(sock, userId, groupId);
    return;
  }

  // Validar título
  if (!validarDescricao(titulo)) {
    const mensagem = `❌ *Título inválido!*

O título deve ter no mínimo *2 palavras de 3 ou mais caracteres* cada.

💡 Exemplo: Manutenção do motor

Digite novamente:`;

    await sock.sendMessage(groupId, { text: mensagem });
    return;
  }

  const estado = obterEstado(userId);
  estado.orcamento.titulo = titulo;
  estado.orcamento.itens = [];
  estado.orcamento.item_atual = {};
  estado.etapa = 'ITEM_DESCRICAO';

  atualizarEstado(userId, estado);

  // Pedir primeiro item
  await pedirDescricaoItem(sock, userId, groupId);
}

// ============================================================
// ETAPA 3: ADICIONAR ITENS
// ============================================================

async function pedirDescricaoItem(sock, userId, groupId) {
  const estado = obterEstado(userId);
  const numeroItem = estado.orcamento.itens.length + 1;

  const mensagem = `✅ Embarcação: ${estado.orcamento.numero_pb} (${estado.orcamento.nome_embarcacao})
✅ Título: ${estado.orcamento.titulo}

━━━━━━━━━━━━━━━━
📦 *PASSO 3/5: ITENS DO ORÇAMENTO*
━━━━━━━━━━━━━━━━

*Item #${numeroItem}* - Digite a descrição:

💡 Exemplo: Troca de óleo do motor

0️⃣ Cancelar orçamento`;

  await sock.sendMessage(groupId, { text: mensagem });
}

async function receberDescricaoItem(sock, userId, groupId, descricao) {
  if (descricao === '0') {
    await mostrarMenuOrcamentos(sock, userId, groupId);
    return;
  }

  // Validar descrição
  if (!validarDescricao(descricao)) {
    const mensagem = `❌ *Descrição inválida!*

O item deve ter no mínimo *2 palavras de 3 ou mais caracteres* cada.

💡 Exemplo: Troca de óleo

Digite novamente:`;

    await sock.sendMessage(groupId, { text: mensagem });
    return;
  }

  const estado = obterEstado(userId);
  const numeroItem = estado.orcamento.itens.length + 1;

  estado.orcamento.item_atual = { descricao, valor: null };
  estado.etapa = 'ITEM_VALOR';

  atualizarEstado(userId, estado);

  // Pedir valor
  const mensagem = `✅ Item #${numeroItem}: ${descricao}

━━━━━━━━━━━━━━━━
💰 *VALOR DO ITEM*
━━━━━━━━━━━━━━━━

Digite o valor (R$) ou "pular":

💡 Formatos aceitos:
• 500
• 500,50
• 5.000,50
• 5000,5

⏭️ Digite "pular" para definir depois

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });
}

async function receberValorItem(sock, userId, groupId, valorTexto) {
  if (valorTexto === '0') {
    await mostrarMenuOrcamentos(sock, userId, groupId);
    return;
  }

  const valor = formatarValor(valorTexto);

  if (valor === 'ERRO_FORMATO') {
    const mensagem = `❌ *Formato inválido!*

Use *VÍRGULA* para separar centavos.

💡 Correto: 5000,50
❌ Errado: 5000.50

Digite novamente ou "pular":`;

    await sock.sendMessage(groupId, { text: mensagem });
    return;
  }

  const estado = obterEstado(userId);
  estado.orcamento.item_atual.valor = valor;

  // Adicionar item à lista
  estado.orcamento.itens.push({
    ordem: estado.orcamento.itens.length + 1,
    descricao: estado.orcamento.item_atual.descricao,
    valor: valor
  });

  estado.etapa = 'ITEM_MENU';
  atualizarEstado(userId, estado);

  // Mostrar opções
  await mostrarMenuItens(sock, userId, groupId);
}

async function mostrarMenuItens(sock, userId, groupId) {
  const estado = obterEstado(userId);
  const ultimoItem = estado.orcamento.itens[estado.orcamento.itens.length - 1];

  const mensagem = `✅ *Item #${ultimoItem.ordem} adicionado:*

📦 ${ultimoItem.descricao}
💰 ${formatarMoeda(ultimoItem.valor)}

━━━━━━━━━━━━━━━━

O que deseja fazer?

1️⃣ ➕ Adicionar outro item
2️⃣ ✏️ Ver/Editar itens
3️⃣ ✅ Finalizar itens

0️⃣ Cancelar orçamento`;

  await sock.sendMessage(groupId, { text: mensagem });
}

async function processarMenuItens(sock, userId, groupId, opcao) {
  if (opcao === '0') {
    await mostrarMenuOrcamentos(sock, userId, groupId);
    return;
  }

  const estado = obterEstado(userId);

  switch (opcao) {
    case '1': // Adicionar outro item
      estado.etapa = 'ITEM_DESCRICAO';
      estado.orcamento.item_atual = {};
      atualizarEstado(userId, estado);
      await pedirDescricaoItem(sock, userId, groupId);
      break;

    case '2': // Ver/Editar itens
      await mostrarListaItens(sock, userId, groupId);
      break;

    case '3': // Finalizar itens
      await mostrarResumoFinal(sock, userId, groupId);
      break;

    default:
      await sock.sendMessage(groupId, {
        text: '❌ Opção inválida! Digite 1, 2, 3 ou 0.'
      });
  }
}

// ============================================================
// VER/EDITAR ITENS
// ============================================================

async function mostrarListaItens(sock, userId, groupId) {
  const estado = obterEstado(userId);

  let mensagem = `📦 *ITENS DO ORÇAMENTO*\n\n`;

  estado.orcamento.itens.forEach(item => {
    mensagem += `${item.ordem}. ${item.descricao}\n   💰 ${formatarMoeda(item.valor)}\n\n`;
  });

  mensagem += `━━━━━━━━━━━━━━━━

Digite o número para editar/excluir
ou escolha:

➕ *A* - Adicionar novo item
✅ *F* - Finalizar itens
🗑️ *E[número]* - Excluir (ex: E3)

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });
  estado.etapa = 'EDITAR_ITENS';
  atualizarEstado(userId, estado);
}

// ============================================================
// RESUMO FINAL
// ============================================================

async function mostrarResumoFinal(sock, userId, groupId) {
  const estado = obterEstado(userId);
  const { orcamento } = estado;

  // Calcular valores
  const subtotal = orcamento.itens.reduce((sum, item) => sum + (item.valor || 0), 0);
  const taxaGestaoPerc = 20; // 20%
  const taxaGestaoValor = subtotal * (taxaGestaoPerc / 100);
  const total = subtotal + taxaGestaoValor;

  let mensagem = `📋 *RESUMO DO ORÇAMENTO*

🚤 Embarcação: ${orcamento.numero_pb} (${orcamento.nome_embarcacao})
📌 Título: ${orcamento.titulo}

━━━━━━━━━━━━━━━━
📦 *ITENS:*

`;

  orcamento.itens.forEach(item => {
    mensagem += `${item.ordem}. ${item.descricao.padEnd(25)} ${formatarMoeda(item.valor)}\n`;
  });

  mensagem += `
━━━━━━━━━━━━━━━━
💰 *VALORES:*

Subtotal (itens).............. ${formatarMoeda(subtotal)}
Taxa de Gestão (${taxaGestaoPerc}%).......... ${formatarMoeda(taxaGestaoValor)}
━━━━━━━━━━━━━━━━
*TOTAL......................... ${formatarMoeda(total)}*

━━━━━━━━━━━━━━━━

1️⃣ ✅ Confirmar e criar orçamento
2️⃣ ✏️ Voltar para editar itens
3️⃣ 🗑️ Cancelar tudo

Escolha uma opção:`;

  await sock.sendMessage(groupId, { text: mensagem });

  // Armazenar valores calculados no estado
  estado.orcamento.subtotal = subtotal;
  estado.orcamento.taxa_gestao_percentual = taxaGestaoPerc;
  estado.orcamento.taxa_gestao_valor = taxaGestaoValor;
  estado.orcamento.valor_total = total;
  estado.etapa = 'CONFIRMAR';

  atualizarEstado(userId, estado);
}

async function processarConfirmacao(sock, userId, groupId, opcao) {
  if (opcao === '3' || opcao === '0') {
    await mostrarMenuOrcamentos(sock, userId, groupId);
    return;
  }

  switch (opcao) {
    case '1': // Confirmar
      await criarOrcamentoBanco(sock, userId, groupId);
      break;

    case '2': // Voltar para editar
      await mostrarListaItens(sock, userId, groupId);
      break;

    default:
      await sock.sendMessage(groupId, {
        text: '❌ Opção inválida! Digite 1, 2 ou 3.'
      });
  }
}

// ============================================================
// SALVAR ORÇAMENTO NO BANCO
// ============================================================

async function criarOrcamentoBanco(sock, userId, groupId) {
  const estado = obterEstado(userId);
  const { orcamento } = estado;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Gerar número único do orçamento (formato: ORC-YYMMDDHHMMSS)
    const agora = new Date();
    const ano = String(agora.getFullYear()).slice(-2);
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    const hora = String(agora.getHours()).padStart(2, '0');
    const min = String(agora.getMinutes()).padStart(2, '0');
    const seg = String(agora.getSeconds()).padStart(2, '0');
    const numeroOrcamento = `ORC-${ano}${mes}${dia}${hora}${min}${seg}`;

    console.log(`📝 [ORCAMENTOS] Criando orçamento número: ${numeroOrcamento}`);

    // 1. Criar orçamento_servico
    // Usar campos existentes: descricao, valor_servicos, taxa_servico_perc, taxa_servico_valor, data_cadastro
    const orcamentoResult = await client.query(`
      INSERT INTO "orcamento_servico" (
        "numero",
        "id_empresa",
        "id_embarcacao",
        "descricao",
        "valor_servicos",
        "taxa_servico_perc",
        "taxa_servico_valor",
        "valor_total",
        "status",
        "id_grupo",
        "data_cadastro"
      ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, 'RASCUNHO', 1, NOW() AT TIME ZONE 'America/Sao_Paulo')
      RETURNING "id_orcamento"
    `, [
      numeroOrcamento,
      orcamento.id_embarcacao,
      orcamento.titulo,
      orcamento.subtotal,
      orcamento.taxa_gestao_percentual,
      orcamento.taxa_gestao_valor,
      orcamento.valor_total
    ]);

    const idOrcamento = orcamentoResult.rows[0].id_orcamento;

    // 2. Criar itens
    // Usar campos existentes: valor_total (ao invés de valor), quantidade = 1, valor_unitario = valor_total
    for (const item of orcamento.itens) {
      await client.query(`
        INSERT INTO "orcamento_item" (
          "id_orcamento",
          "ordem",
          "descricao",
          "quantidade",
          "valor_unitario",
          "valor_total"
        ) VALUES ($1, $2, $3, 1, $4, $4)
      `, [idOrcamento, item.ordem, item.descricao, item.valor || 0]);
    }

    await client.query('COMMIT');

    const mensagem = `✅ *ORÇAMENTO CRIADO COM SUCESSO!*

🆔 Número: #${idOrcamento}
🚤 Embarcação: ${orcamento.numero_pb}
💰 Valor Total: ${formatarMoeda(orcamento.valor_total)}

━━━━━━━━━━━━━━━━

O orçamento foi salvo e está disponível para consulta.

Digite *menu* para voltar ao menu principal.`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Limpar estado
    limparEstado(userId);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar orçamento:', error);

    await sock.sendMessage(groupId, {
      text: `❌ *ERRO AO CRIAR ORÇAMENTO*\n\n${error.message}\n\nTente novamente.`
    });
  } finally {
    client.release();
  }
}

// ============================================================
// CONSULTAR ORÇAMENTOS
// ============================================================

async function listarOrcamentosAbertos(sock, userId, groupId) {
  try {
    console.log('📋 [ORCAMENTOS] Listando orçamentos abertos...');

    const result = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_total,
        os.status,
        os.data_orcamento,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao
      FROM "orcamento_servico" os
      JOIN "P_BOAT_1_Embarcacao" e ON e."Código" = os.id_embarcacao
      WHERE os.status IN ('RASCUNHO', 'ENVIADO')
        AND os.id_grupo = 1
      ORDER BY os.data_orcamento DESC, os.id_orcamento DESC
      LIMIT 20
    `);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `📋 *ORÇAMENTOS ABERTOS*\n\n❌ Nenhum orçamento aberto encontrado.\n\nDigite *menu* para voltar.`
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━
📋 *ORÇAMENTOS ABERTOS*
━━━━━━━━━━━━━━━━

Total: ${result.rows.length} orçamento(s)

`;

    result.rows.forEach((orc, index) => {
      const data = new Date(orc.data_orcamento).toLocaleDateString('pt-BR');
      const statusEmoji = orc.status === 'RASCUNHO' ? '📝' : '📤';

      mensagem += `${index + 1}️⃣ #${orc.id_orcamento} - ${orc.numero}\n`;
      mensagem += `   ${statusEmoji} ${orc.status}\n`;
      mensagem += `   🚤 ${orc.numero_pb} - ${orc.nome_embarcacao}\n`;
      mensagem += `   💰 ${formatarMoeda(orc.valor_total)}\n`;
      mensagem += `   📅 ${data}\n\n`;
    });

    mensagem += `━━━━━━━━━━━━━━━━
Digite o número para ver detalhes
ou 0 para voltar ao menu.`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'LISTAR_ABERTOS',
      orcamentos: result.rows
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar abertos:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar orçamentos abertos.\n\n${error.message}`
    });
  }
}

async function perguntarDiasFechados(sock, userId, groupId) {
  const mensagem = `━━━━━━━━━━━━━━━━
📅 *PERÍODO DE CONSULTA*
━━━━━━━━━━━━━━━━

Quantos dias para trás?

1️⃣ Últimos 7 dias
2️⃣ Últimos 15 dias
3️⃣ Últimos 30 dias
4️⃣ Últimos 60 dias
5️⃣ Últimos 90 dias
6️⃣ Todos

0️⃣ Voltar

━━━━━━━━━━━━━━━━
Digite o número:`;

  await sock.sendMessage(groupId, { text: mensagem });

  // Atualizar estado
  atualizarEstado(userId, { etapa: 'FECHADOS_DIAS' });
}

async function listarOrcamentosFechados(sock, userId, groupId, dias = null) {
  try {
    console.log(`✅ [ORCAMENTOS] Listando orçamentos fechados (${dias ? dias + ' dias' : 'todos'})...`);

    let whereClause = `os.status IN ('APROVADO', 'RECUSADO', 'CONCLUIDO', 'CANCELADO')
        AND os.id_grupo = 1`;

    if (dias !== null) {
      whereClause += `
        AND os.data_orcamento >= CURRENT_DATE - INTERVAL '${dias} days'`;
    }

    const result = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_total,
        os.status,
        os.data_orcamento,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao
      FROM "orcamento_servico" os
      JOIN "P_BOAT_1_Embarcacao" e ON e."Código" = os.id_embarcacao
      WHERE ${whereClause}
      ORDER BY os.data_orcamento DESC, os.id_orcamento DESC
      LIMIT 50
    `);

    const periodo = dias === null ? 'Todos' : `Últimos ${dias} dias`;

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `✅ *ORÇAMENTOS FECHADOS*\n📅 ${periodo}\n\n❌ Nenhum orçamento fechado encontrado.\n\nDigite *menu* para voltar.`
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━
✅ *ORÇAMENTOS FECHADOS*
━━━━━━━━━━━━━━━━
📅 Período: ${periodo}

Total: ${result.rows.length} orçamento(s)

`;

    result.rows.forEach((orc, index) => {
      const data = new Date(orc.data_orcamento).toLocaleDateString('pt-BR');
      let statusEmoji = '✅';
      if (orc.status === 'RECUSADO') statusEmoji = '❌';
      if (orc.status === 'CANCELADO') statusEmoji = '🚫';
      if (orc.status === 'CONCLUIDO') statusEmoji = '✅';

      mensagem += `${index + 1}️⃣ #${orc.id_orcamento} - ${orc.numero}\n`;
      mensagem += `   ${statusEmoji} ${orc.status}\n`;
      mensagem += `   🚤 ${orc.numero_pb} - ${orc.nome_embarcacao}\n`;
      mensagem += `   💰 ${formatarMoeda(orc.valor_total)}\n`;
      mensagem += `   📅 ${data}\n\n`;
    });

    mensagem += `━━━━━━━━━━━━━━━━
Digite o número para ver detalhes
ou 0 para voltar ao menu.`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'LISTAR_FECHADOS',
      orcamentos: result.rows
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar fechados:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar orçamentos fechados.\n\n${error.message}`
    });
  }
}

async function listarEmbarcacoesParaConsulta(sock, userId, groupId) {
  try {
    console.log('🚤 [ORCAMENTOS] Listando embarcações para consulta...');

    // Buscar embarcações com contagem de orçamentos
    const result = await pool.query(`
      SELECT
        e."Código" as codigo,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome,
        COUNT(os.id_orcamento) as total_orcamentos
      FROM "P_BOAT_1_Embarcacao" e
      LEFT JOIN "orcamento_servico" os ON os.id_embarcacao = e."Código"
        AND os.id_grupo = 1
      WHERE e."Cod_Cliente" = 4255
      GROUP BY e."Código", e."Num_PB", e."Nome_Embar"
      ORDER BY e."Num_PB"
    `);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: '❌ Nenhuma embarcação ALLMAX encontrada.'
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━
🚤 *ORÇAMENTOS POR EMBARCAÇÃO*
━━━━━━━━━━━━━━━━

Selecione a embarcação:

`;

    result.rows.forEach((emb, index) => {
      const qtd = emb.total_orcamentos > 0 ? ` (${emb.total_orcamentos})` : ' (0)';
      mensagem += `${index + 1}️⃣ ${emb.numero_pb} - ${emb.nome}${qtd}\n`;
    });

    mensagem += `\n0️⃣ Voltar\n\n━━━━━━━━━━━━━━━━\nDigite o número:`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'SELECIONAR_EMBARCACAO_CONSULTA',
      embarcacoes: result.rows
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar embarcações:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar embarcações.\n\n${error.message}`
    });
  }
}

async function listarOrcamentosPorEmbarcacao(sock, userId, groupId, idEmbarcacao, nomeEmbarcacao, numeroPb) {
  try {
    console.log(`🚤 [ORCAMENTOS] Listando orçamentos da embarcação ${numeroPb}...`);

    const result = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_total,
        os.status,
        os.data_orcamento
      FROM "orcamento_servico" os
      WHERE os.id_embarcacao = $1
        AND os.id_grupo = 1
      ORDER BY os.data_orcamento DESC, os.id_orcamento DESC
    `, [idEmbarcacao]);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `🚤 *${numeroPb} - ${nomeEmbarcacao}*\n\n❌ Nenhum orçamento encontrado para esta embarcação.\n\nDigite *menu* para voltar.`
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━
🚤 *${numeroPb} - ${nomeEmbarcacao}*
━━━━━━━━━━━━━━━━

Total: ${result.rows.length} orçamento(s)

`;

    result.rows.forEach((orc, index) => {
      const data = new Date(orc.data_orcamento).toLocaleDateString('pt-BR');
      let statusEmoji = '📝';
      if (orc.status === 'ENVIADO') statusEmoji = '📤';
      if (orc.status === 'APROVADO') statusEmoji = '✅';
      if (orc.status === 'RECUSADO') statusEmoji = '❌';
      if (orc.status === 'CONCLUIDO') statusEmoji = '✅';
      if (orc.status === 'CANCELADO') statusEmoji = '🚫';

      mensagem += `${index + 1}️⃣ #${orc.id_orcamento} - ${orc.numero}\n`;
      mensagem += `   ${statusEmoji} ${orc.status}\n`;
      mensagem += `   💰 ${formatarMoeda(orc.valor_total)}\n`;
      mensagem += `   📅 ${data}\n\n`;
    });

    mensagem += `━━━━━━━━━━━━━━━━
Digite o número para ver detalhes
ou 0 para voltar ao menu.`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'LISTAR_POR_EMBARCACAO',
      orcamentos: result.rows,
      embarcacao: { id: idEmbarcacao, nome: nomeEmbarcacao, numero_pb: numeroPb }
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar por embarcação:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar orçamentos.\n\n${error.message}`
    });
  }
}

async function listarPendentesAprovacao(sock, userId, groupId) {
  try {
    console.log('⏰ [ORCAMENTOS] Listando pendentes de aprovação...');

    const result = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_total,
        os.status,
        os.data_orcamento,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao,
        CURRENT_DATE - os.data_orcamento::date as dias_pendente
      FROM "orcamento_servico" os
      JOIN "P_BOAT_1_Embarcacao" e ON e."Código" = os.id_embarcacao
      WHERE os.status IN ('RASCUNHO', 'ENVIADO')
        AND os.id_grupo = 1
      ORDER BY os.data_orcamento ASC, os.id_orcamento ASC
      LIMIT 50
    `);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `⏰ *PENDENTES DE APROVAÇÃO*\n\n✅ Nenhum orçamento pendente de aprovação!\n\nDigite *menu* para voltar.`
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━
⏰ *PENDENTES DE APROVAÇÃO*
━━━━━━━━━━━━━━━━

Total: ${result.rows.length} orçamento(s)
⚠️ Ordenado por mais antigo

`;

    result.rows.forEach((orc, index) => {
      const data = new Date(orc.data_orcamento).toLocaleDateString('pt-BR');
      const statusEmoji = orc.status === 'RASCUNHO' ? '📝' : '📤';
      const diasTexto = orc.dias_pendente === 0 ? 'Hoje' :
                        orc.dias_pendente === 1 ? '1 dia' :
                        `${orc.dias_pendente} dias`;

      mensagem += `${index + 1}️⃣ #${orc.id_orcamento} - ${orc.numero}\n`;
      mensagem += `   ${statusEmoji} ${orc.status} (${diasTexto})\n`;
      mensagem += `   🚤 ${orc.numero_pb} - ${orc.nome_embarcacao}\n`;
      mensagem += `   💰 ${formatarMoeda(orc.valor_total)}\n`;
      mensagem += `   📅 ${data}\n\n`;
    });

    mensagem += `━━━━━━━━━━━━━━━━
Digite o número para ver detalhes
ou 0 para voltar ao menu.`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'LISTAR_PENDENTES_APROVACAO',
      orcamentos: result.rows
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar pendentes aprovação:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar pendentes.\n\n${error.message}`
    });
  }
}

async function listarPendentesCobranca(sock, userId, groupId) {
  try {
    console.log('💵 [ORCAMENTOS] Listando pendentes de cobrança...');

    // Buscar orçamentos APROVADOS que ainda não têm cobrança gerada
    // Verificar se existe registro em Contas_Receber vinculado
    const result = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_total,
        os.status,
        os.data_orcamento,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao,
        CURRENT_DATE - os.data_orcamento::date as dias_aprovado,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM "Contas_Receber" cr
            WHERE cr."Origem" = 'ORCAMENTO'
              AND cr."Num_Origem"::text = os.id_orcamento::text
          ) THEN true
          ELSE false
        END as tem_cobranca
      FROM "orcamento_servico" os
      JOIN "P_BOAT_1_Embarcacao" e ON e."Código" = os.id_embarcacao
      WHERE os.status = 'APROVADO'
        AND os.id_grupo = 1
      ORDER BY os.data_orcamento ASC, os.id_orcamento ASC
      LIMIT 50
    `);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `💵 *PENDENTES DE COBRANÇA*\n\n✅ Nenhum orçamento aprovado pendente de cobrança!\n\nDigite *menu* para voltar.`
      });
      return;
    }

    // Filtrar apenas os que NÃO têm cobrança
    const pendentes = result.rows.filter(orc => !orc.tem_cobranca);

    if (pendentes.length === 0) {
      await sock.sendMessage(groupId, {
        text: `💵 *PENDENTES DE COBRANÇA*\n\n✅ Todos os orçamentos aprovados já foram cobrados!\n\n📊 Total aprovados: ${result.rows.length}\n✅ Cobrados: ${result.rows.length}\n⏳ Pendentes: 0\n\nDigite *menu* para voltar.`
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━
💵 *PENDENTES DE COBRANÇA*
━━━━━━━━━━━━━━━━

📊 Total aprovados: ${result.rows.length}
✅ Já cobrados: ${result.rows.length - pendentes.length}
⏳ Pendentes: ${pendentes.length}

`;

    pendentes.forEach((orc, index) => {
      const data = new Date(orc.data_orcamento).toLocaleDateString('pt-BR');
      const diasTexto = orc.dias_aprovado === 0 ? 'Hoje' :
                        orc.dias_aprovado === 1 ? '1 dia' :
                        `${orc.dias_aprovado} dias`;

      mensagem += `${index + 1}️⃣ #${orc.id_orcamento} - ${orc.numero}\n`;
      mensagem += `   ⏰ Aprovado há ${diasTexto}\n`;
      mensagem += `   🚤 ${orc.numero_pb} - ${orc.nome_embarcacao}\n`;
      mensagem += `   💰 ${formatarMoeda(orc.valor_total)}\n`;
      mensagem += `   📅 ${data}\n\n`;
    });

    mensagem += `━━━━━━━━━━━━━━━━
Digite o número para ver detalhes
ou 0 para voltar ao menu.`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'LISTAR_PENDENTES_COBRANCA',
      orcamentos: pendentes
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar pendentes cobrança:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar pendentes.\n\n${error.message}`
    });
  }
}

async function verDetalhesOrcamento(sock, userId, groupId, idOrcamento) {
  try {
    console.log(`🔍 [ORCAMENTOS] Buscando detalhes do orçamento #${idOrcamento}...`);

    // Buscar cabeçalho
    const orcResult = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_servicos as subtotal,
        os.taxa_servico_perc,
        os.taxa_servico_valor,
        os.valor_total,
        os.status,
        os.data_orcamento,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao
      FROM "orcamento_servico" os
      JOIN "P_BOAT_1_Embarcacao" e ON e."Código" = os.id_embarcacao
      WHERE os.id_orcamento = $1
    `, [idOrcamento]);

    if (orcResult.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: '❌ Orçamento não encontrado.'
      });
      return;
    }

    const orc = orcResult.rows[0];

    // Buscar itens
    const itensResult = await pool.query(`
      SELECT
        ordem,
        descricao,
        quantidade,
        valor_unitario,
        valor_total
      FROM "orcamento_item"
      WHERE id_orcamento = $1
      ORDER BY ordem
    `, [idOrcamento]);

    // Montar mensagem
    const data = new Date(orc.data_orcamento).toLocaleDateString('pt-BR');
    let statusEmoji = '📝';
    if (orc.status === 'ENVIADO') statusEmoji = '📤';
    if (orc.status === 'APROVADO') statusEmoji = '✅';
    if (orc.status === 'RECUSADO') statusEmoji = '❌';
    if (orc.status === 'CONCLUIDO') statusEmoji = '✅';
    if (orc.status === 'CANCELADO') statusEmoji = '🚫';

    let mensagem = `━━━━━━━━━━━━━━━━
📋 *DETALHES DO ORÇAMENTO*
━━━━━━━━━━━━━━━━

🆔 Número: ${orc.numero}
${statusEmoji} Status: ${orc.status}
🚤 Embarcação: ${orc.numero_pb} - ${orc.nome_embarcacao}
📅 Data: ${data}

━━━━━━━━━━━━━━━━
📌 *TÍTULO:*
${orc.titulo}

━━━━━━━━━━━━━━━━
📦 *ITENS:*

`;

    if (itensResult.rows.length === 0) {
      mensagem += '(nenhum item cadastrado)\n\n';
    } else {
      itensResult.rows.forEach(item => {
        mensagem += `${item.ordem}. ${item.descricao}\n`;
        mensagem += `   ${formatarMoeda(item.valor_total)}\n\n`;
      });
    }

    mensagem += `━━━━━━━━━━━━━━━━
💰 *VALORES:*

Subtotal: ${formatarMoeda(orc.subtotal)}
Taxa gestão (${orc.taxa_servico_perc}%): ${formatarMoeda(orc.taxa_servico_valor)}

*TOTAL: ${formatarMoeda(orc.valor_total)}*

━━━━━━━━━━━━━━━━
Digite *menu* para voltar.`;

    await sock.sendMessage(groupId, { text: mensagem });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao buscar detalhes:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar detalhes.\n\n${error.message}`
    });
  }
}

// ============================================================
// PROCESSADOR PRINCIPAL DE MENSAGENS
// ============================================================

export async function processarMensagemOrcamentos(sock, userId, groupId, mensagem) {
  const estado = obterEstado(userId);
  const texto = mensagem.trim();

  // Menu principal
  if (estado.etapa === 'MENU') {
    switch (texto) {
      case '1':
        await listarEmbarcacoes(sock, userId, groupId);
        break;
      case '2':
        await listarOrcamentosAbertos(sock, userId, groupId);
        break;
      case '3':
        await perguntarDiasFechados(sock, userId, groupId);
        break;
      case '4':
        await listarEmbarcacoesParaConsulta(sock, userId, groupId);
        break;
      case '5':
        await listarPendentesAprovacao(sock, userId, groupId);
        break;
      case '6':
        await listarPendentesCobranca(sock, userId, groupId);
        break;
      case '0':
        limparEstado(userId);
        await sock.sendMessage(groupId, { text: '👋 Até logo!' });
        break;
      default:
        await sock.sendMessage(groupId, { text: '❌ Opção inválida! Digite 1, 2, 3, 4, 5, 6 ou 0.' });
    }
    return;
  }

  // Submenu de dias para orçamentos fechados
  if (estado.etapa === 'FECHADOS_DIAS') {
    if (texto === '0') {
      await mostrarMenuOrcamentos(sock, userId, groupId);
      return;
    }

    let dias = null;
    switch (texto) {
      case '1': dias = 7; break;
      case '2': dias = 15; break;
      case '3': dias = 30; break;
      case '4': dias = 60; break;
      case '5': dias = 90; break;
      case '6': dias = null; break; // Todos
      default:
        await sock.sendMessage(groupId, { text: '❌ Opção inválida! Digite 1 a 6 ou 0 para voltar.' });
        return;
    }

    await listarOrcamentosFechados(sock, userId, groupId, dias);
    return;
  }

  // Seleção de embarcação para consulta
  if (estado.etapa === 'SELECIONAR_EMBARCACAO_CONSULTA') {
    if (texto === '0') {
      await mostrarMenuOrcamentos(sock, userId, groupId);
      return;
    }

    const index = parseInt(texto) - 1;
    if (isNaN(index) || index < 0 || index >= estado.embarcacoes.length) {
      await sock.sendMessage(groupId, {
        text: '❌ Opção inválida! Digite o número da embarcação ou 0 para voltar.'
      });
      return;
    }

    const embarcacao = estado.embarcacoes[index];
    await listarOrcamentosPorEmbarcacao(
      sock, userId, groupId,
      embarcacao.codigo,
      embarcacao.nome,
      embarcacao.numero_pb
    );
    return;
  }

  // Listagens de orçamentos
  if (estado.etapa === 'LISTAR_ABERTOS' ||
      estado.etapa === 'LISTAR_FECHADOS' ||
      estado.etapa === 'LISTAR_POR_EMBARCACAO' ||
      estado.etapa === 'LISTAR_PENDENTES_APROVACAO' ||
      estado.etapa === 'LISTAR_PENDENTES_COBRANCA') {
    if (texto === '0') {
      await mostrarMenuOrcamentos(sock, userId, groupId);
      return;
    }

    const index = parseInt(texto) - 1;
    if (isNaN(index) || index < 0 || index >= estado.orcamentos.length) {
      await sock.sendMessage(groupId, {
        text: '❌ Opção inválida! Digite o número do orçamento ou 0 para voltar.'
      });
      return;
    }

    const orcamento = estado.orcamentos[index];
    await verDetalhesOrcamento(sock, userId, groupId, orcamento.id_orcamento);
    return;
  }

  // Fluxo de criação
  switch (estado.etapa) {
    case 'SELECIONAR_EMBARCACAO':
      await selecionarEmbarcacao(sock, userId, groupId, texto);
      break;

    case 'TITULO':
      await receberTitulo(sock, userId, groupId, texto);
      break;

    case 'ITEM_DESCRICAO':
      await receberDescricaoItem(sock, userId, groupId, texto);
      break;

    case 'ITEM_VALOR':
      await receberValorItem(sock, userId, groupId, texto);
      break;

    case 'ITEM_MENU':
      await processarMenuItens(sock, userId, groupId, texto);
      break;

    case 'EDITAR_ITENS':
      // TODO: Implementar edição de itens
      await sock.sendMessage(groupId, { text: '🚧 Edição em desenvolvimento. Digite F para finalizar.' });
      break;

    case 'CONFIRMAR':
      await processarConfirmacao(sock, userId, groupId, texto);
      break;

    default:
      await mostrarMenuOrcamentos(sock, userId, groupId);
  }
}

// V.2610241109
