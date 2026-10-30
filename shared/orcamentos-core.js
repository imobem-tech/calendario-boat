// ============================================================
// shared/orcamentos-core.js — V.2610301200
// LÓGICA COMPARTILHADA DO SISTEMA DE ORÇAMENTOS
//
// 🎯 FONTE ÚNICA DE VERDADE
// - Compartilhada entre WhatsApp e Web
// - Altere AQUI e funciona em AMBOS os canais
//
// RESPONSABILIDADES:
// - Menus (textos, opções, emojis)
// - Estados (máquina de estados)
// - Validações (descrições, valores)
// - Formatações (moeda, números)
// - Constantes (limites, valores padrão)
// - Cálculos (totais, taxas)
// ============================================================

// ============================================================
// CONSTANTES
// ============================================================

export const CONSTANTES = {
  // Parcelamento e cobrança
  PARCELA_MINIMA_INDIVIDUAL: 500.00,  // R$ 500 mínimo por cotista por parcela
  MAX_PARCELAS: 6,                     // Até 6 parcelas
  DIAS_VENCIMENTO_PADRAO: 5,           // Vencimento padrão: 5 dias
  MAX_DIAS_PRIMEIRA_PARCELA: 30,      // Data primeira parcela: máx 30 dias

  // Taxas
  TAXA_GESTAO_PERCENTUAL: 20,         // Taxa de gestão fixa: 20%

  // Validações
  MIN_PALAVRAS_DESCRICAO: 2,          // Mínimo 2 palavras
  MIN_CHARS_PALAVRA: 3,               // Cada palavra com 3+ caracteres

  // IDs
  ID_EMPRESA_ALLMAX: 1,               // ID da empresa ALLMAX
  ID_GRUPO_ORCAMENTOS: 1,             // ID do grupo de orçamentos
  COD_CLIENTE_ALLMAX: 4255            // Código cliente ALLMAX
};

// ============================================================
// MENUS - FONTE ÚNICA
// ============================================================

/**
 * Menu principal do sistema de orçamentos
 * @param {Object} contagens - { abertos, porEmb, pendAprov, pendCobr }
 */
export function gerarMenuPrincipal(contagens = {}) {
  const { abertos = 0, porEmb = 0, pendAprov = 0, pendCobr = 0 } = contagens;

  return {
    mensagem: `━━━━━━━━━━━━━━━━
💼 *SISTEMA DE ORÇAMENTOS*
━━━━━━━━━━━━━━━━
Escolha uma opção:

1️⃣ ➕ Criar Novo Orçamento
2️⃣ 📋 Consultar Orç. Rascunho (${abertos})
3️⃣ ✅ Consultar Orç. Fechados
4️⃣ 🚤 Orç. por Embarcação (${porEmb})
5️⃣ ⏰ Pendentes Aprovação (${pendAprov})
6️⃣ 💵 Pendentes de cobrança (${pendCobr})
0️⃣ 🔙 Voltar ao Menu Principal

━━━━━━━━━━━━━━━━
Digite o número da opção:`,
    opcoes: [
      { num: '1', emoji: '➕', texto: 'Criar Novo Orçamento', acao: 'CRIAR' },
      { num: '2', emoji: '📋', texto: `Consultar Orç. Rascunho (${abertos})`, acao: 'LISTAR_ABERTOS' },
      { num: '3', emoji: '✅', texto: 'Consultar Orç. Fechados', acao: 'LISTAR_FECHADOS' },
      { num: '4', emoji: '🚤', texto: `Orç. por Embarcação (${porEmb})`, acao: 'LISTAR_POR_EMBARCACAO' },
      { num: '5', emoji: '⏰', texto: `Pendentes Aprovação (${pendAprov})`, acao: 'LISTAR_PENDENTES_APROVACAO' },
      { num: '6', emoji: '💵', texto: `Pendentes de cobrança (${pendCobr})`, acao: 'LISTAR_PENDENTES_COBRANCA' },
      { num: '0', emoji: '🔙', texto: 'Voltar ao Menu Principal', acao: 'VOLTAR' }
    ]
  };
}

/**
 * Menu de seleção de embarcação
 * @param {Array} embarcacoes - Lista de embarcações
 */
export function gerarMenuEmbarcacoes(embarcacoes) {
  let mensagem = `━━━━━━━━━━━━━━━━
🚤 *SELECIONAR EMBARCAÇÃO*
━━━━━━━━━━━━━━━━
Escolha a embarcação:

`;

  const opcoes = embarcacoes.map((emb, index) => {
    mensagem += `${index + 1}️⃣ ${emb.numero_pb} - ${emb.nome}\n`;

    return {
      num: String(index + 1),
      emoji: '🚤',
      texto: `${emb.numero_pb} - ${emb.nome}`,
      embarcacao: emb
    };
  });

  mensagem += `\n0️⃣ Cancelar\n\n━━━━━━━━━━━━━━━━\nDigite o número:`;

  opcoes.push({ num: '0', emoji: '🔙', texto: 'Cancelar', acao: 'CANCELAR' });

  return { mensagem, opcoes };
}

/**
 * Mensagem de solicitação de título
 */
export function gerarMensagemTitulo(numeroPb, nomeEmbarcacao) {
  return `✅ Embarcação selecionada: ${numeroPb} (${nomeEmbarcacao})

━━━━━━━━━━━━━━━━
📝 *PASSO 2/5: TÍTULO DO ORÇAMENTO*
━━━━━━━━━━━━━━━━
Digite o título do orçamento:

💡 Exemplo: Manutenção preventiva do motor

0️⃣ Cancelar`;
}

/**
 * Mensagem de solicitação de descrição de item
 */
export function gerarMensagemDescricaoItem(numeroPb, nomeEmbarcacao, titulo, numeroItem) {
  return `✅ Embarcação: ${numeroPb} (${nomeEmbarcacao})
✅ Título: ${titulo}

━━━━━━━━━━━━━━━━
📦 *PASSO 3/5: ITENS DO ORÇAMENTO*
━━━━━━━━━━━━━━━━
*Item #${numeroItem}* - Digite a descrição:

💡 Exemplo: Troca de óleo do motor

1️⃣ Pular cadastro de item
0️⃣ Voltar ao título`;
}

/**
 * Mensagem de solicitação de valor de item
 */
export function gerarMensagemValorItem(descricao, numeroItem) {
  return `✅ Item #${numeroItem}: ${descricao}

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
}

/**
 * Menu após adicionar item
 */
export function gerarMenuItens(ultimoItem) {
  return `✅ *Item #${ultimoItem.ordem} adicionado:*

📦 ${ultimoItem.descricao}
💰 ${formatarMoeda(ultimoItem.valor)}

━━━━━━━━━━━━━━━━
O que deseja fazer?

1️⃣ ➕ Adicionar outro item
2️⃣ ✅ Finalizar itens

0️⃣ Cancelar orçamento`;
}

/**
 * Resumo final do orçamento
 */
export function gerarResumoFinal(orcamento) {
  const subtotal = calcularSubtotal(orcamento.itens);
  const taxaGestaoPerc = CONSTANTES.TAXA_GESTAO_PERCENTUAL;
  const taxaGestaoValor = calcularTaxaGestao(subtotal);
  const total = subtotal + taxaGestaoValor;

  let mensagem = `📋 *RESUMO DO ORÇAMENTO*

🚤 Embarcação: ${orcamento.numero_pb} (${orcamento.nome_embarcacao})
📌 Título: ${orcamento.titulo}

━━━━━━━━━━━━━━━━
📦 *ITENS:*

`;

  orcamento.itens.forEach(item => {
    mensagem += `${item.ordem}. ${item.descricao.substring(0, 25).padEnd(25)} ${formatarMoeda(item.valor)}\n`;
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
2️⃣ 🗑️ Cancelar tudo

Escolha uma opção:`;

  return {
    mensagem,
    valores: {
      subtotal,
      taxa_gestao_percentual: taxaGestaoPerc,
      taxa_gestao_valor: taxaGestaoValor,
      valor_total: total
    }
  };
}

// ============================================================
// VALIDAÇÕES
// ============================================================

/**
 * Valida descrição (título ou item)
 * Regra: Mínimo 2 palavras de 3+ caracteres cada
 */
export function validarDescricao(texto) {
  const palavras = texto.trim().split(/\s+/).filter(p => p.length >= CONSTANTES.MIN_CHARS_PALAVRA);
  return {
    valido: palavras.length >= CONSTANTES.MIN_PALAVRAS_DESCRICAO,
    mensagemErro: palavras.length < CONSTANTES.MIN_PALAVRAS_DESCRICAO
      ? `❌ *Descrição inválida!*

O texto deve ter no mínimo *2 palavras de 3 ou mais caracteres* cada.

💡 Exemplo: Troca de óleo

Digite novamente:`
      : null
  };
}

/**
 * Formata e valida valor monetário
 * Aceita: 5000, 5000,50, 5.000,50, 5000,5
 * Retorna: { valido, valor, mensagemErro }
 */
export function validarValor(texto) {
  // Remover espaços
  texto = texto.trim();

  // Se digitar "pular", retorna válido com valor null
  if (texto.toLowerCase() === 'pular') {
    return { valido: true, valor: null, mensagemErro: null };
  }

  // Verificar se tem ponto SEM vírgula (formato inválido)
  if (texto.includes('.') && !texto.includes(',')) {
    return {
      valido: false,
      valor: null,
      mensagemErro: `❌ *Formato inválido!*

Use *VÍRGULA* para separar centavos.

💡 Correto: 5000,50
❌ Errado: 5000.50

Digite novamente ou "pular":`
    };
  }

  // Remover pontos (separador de milhar)
  let valorLimpo = texto.replace(/\./g, '');

  // Trocar vírgula por ponto (padrão JS)
  valorLimpo = valorLimpo.replace(',', '.');

  // Tentar converter
  const valor = parseFloat(valorLimpo);

  if (isNaN(valor) || valor <= 0) {
    return {
      valido: false,
      valor: null,
      mensagemErro: `❌ *Formato inválido!*

Use *VÍRGULA* para separar centavos.

💡 Correto: 5000,50
❌ Errado: 5000.50

Digite novamente ou "pular":`
    };
  }

  return { valido: true, valor, mensagemErro: null };
}

// ============================================================
// FORMATAÇÕES
// ============================================================

/**
 * Formata valor para exibição brasileira
 */
export function formatarMoeda(valor) {
  if (valor === null || valor === undefined) {
    return '(não informado)';
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata número do orçamento
 */
export function formatarNumeroOrcamento(idOrcamento, numero) {
  // Formata: 051ORC-261025152542 (ID com 3 dígitos + número)
  const idFormatado = String(idOrcamento).padStart(3, '0');
  return `${idFormatado}${numero}`;
}

// ============================================================
// CÁLCULOS
// ============================================================

/**
 * Calcula subtotal dos itens
 */
export function calcularSubtotal(itens) {
  return itens.reduce((sum, item) => sum + (item.valor || 0), 0);
}

/**
 * Calcula taxa de gestão
 */
export function calcularTaxaGestao(subtotal) {
  return subtotal * (CONSTANTES.TAXA_GESTAO_PERCENTUAL / 100);
}

/**
 * Calcula valores totais do orçamento
 */
export function calcularValores(itens) {
  const subtotal = calcularSubtotal(itens);
  const taxaGestaoValor = calcularTaxaGestao(subtotal);
  const total = subtotal + taxaGestaoValor;

  return {
    subtotal,
    taxa_gestao_percentual: CONSTANTES.TAXA_GESTAO_PERCENTUAL,
    taxa_gestao_valor: taxaGestaoValor,
    valor_total: total
  };
}

// ============================================================
// MÁQUINA DE ESTADOS
// ============================================================

/**
 * Estados possíveis do fluxo de orçamentos
 */
export const ESTADOS = {
  MENU: 'MENU',
  SELECIONAR_EMBARCACAO: 'SELECIONAR_EMBARCACAO',
  TITULO: 'TITULO',
  ITEM_DESCRICAO: 'ITEM_DESCRICAO',
  ITEM_VALOR: 'ITEM_VALOR',
  ITEM_MENU: 'ITEM_MENU',
  REVISAR: 'REVISAR',
  CONFIRMAR: 'CONFIRMAR',
  ORCAMENTO_CRIADO: 'ORCAMENTO_CRIADO',

  // Consultas
  LISTAR_ABERTOS: 'LISTAR_ABERTOS',
  LISTAR_FECHADOS: 'LISTAR_FECHADOS',
  FECHADOS_DIAS: 'FECHADOS_DIAS',
  LISTAR_POR_EMBARCACAO: 'LISTAR_POR_EMBARCACAO',
  SELECIONAR_EMBARCACAO_CONSULTA: 'SELECIONAR_EMBARCACAO_CONSULTA',
  LISTAR_PENDENTES_APROVACAO: 'LISTAR_PENDENTES_APROVACAO',
  LISTAR_PENDENTES_COBRANCA: 'LISTAR_PENDENTES_COBRANCA',

  // Edição
  EDITAR_ITENS: 'EDITAR_ITENS',
  EDITAR_ITENS_BANCO: 'EDITAR_ITENS_BANCO',
  ADICIONAR_ITEM_DESCRICAO: 'ADICIONAR_ITEM_DESCRICAO',
  ADICIONAR_ITEM_VALOR: 'ADICIONAR_ITEM_VALOR',
  EDITAR_ITEM_MENU: 'EDITAR_ITEM_MENU',
  EDITAR_ITEM_DESCRICAO: 'EDITAR_ITEM_DESCRICAO',
  EDITAR_ITEM_VALOR: 'EDITAR_ITEM_VALOR',
  CONFIRMAR_EXCLUSAO_ITEM: 'CONFIRMAR_EXCLUSAO_ITEM'
};

/**
 * Estrutura inicial do estado
 */
export function criarEstadoInicial() {
  return {
    etapa: ESTADOS.MENU,
    orcamento: null
  };
}

/**
 * Estrutura do orçamento em criação
 */
export function criarNovoOrcamento(embarcacao) {
  return {
    id_embarcacao: embarcacao.numero_pb,    // FK para banco
    numero_pb: embarcacao.numero_pb,        // Exibição
    nome_embarcacao: embarcacao.nome,
    titulo: null,
    itens: [],
    item_atual: {},
    subtotal: 0,
    taxa_gestao_percentual: CONSTANTES.TAXA_GESTAO_PERCENTUAL,
    taxa_gestao_valor: 0,
    valor_total: 0
  };
}

/**
 * Adiciona item ao orçamento
 */
export function adicionarItem(orcamento, descricao, valor) {
  const novoItem = {
    ordem: orcamento.itens.length + 1,
    descricao: descricao,
    valor: valor || 0
  };

  orcamento.itens.push(novoItem);

  // Recalcular valores
  const valores = calcularValores(orcamento.itens);
  orcamento.subtotal = valores.subtotal;
  orcamento.taxa_gestao_valor = valores.taxa_gestao_valor;
  orcamento.valor_total = valores.valor_total;

  return orcamento;
}

// ============================================================
// GERAÇÃO DE NÚMERO DE ORÇAMENTO
// ============================================================

/**
 * Gera número único do orçamento (formato: ORC-YYMMDDHHMMSS)
 */
export function gerarNumeroOrcamento() {
  const agora = new Date();
  const ano = String(agora.getFullYear()).slice(-2);
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  const hora = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  const seg = String(agora.getSeconds()).padStart(2, '0');
  return `ORC-${ano}${mes}${dia}${hora}${min}${seg}`;
}

// ============================================================
// QUERIES SQL - COMPARTILHADAS
// ============================================================

export const QUERIES = {
  // Contagens para menu principal
  CONTAGENS_MENU: `
    SELECT
      (SELECT COUNT(*) FROM "orcamento_servico" WHERE status = 'RASCUNHO' AND id_grupo = 1) as abertos,
      (SELECT COUNT(*) FROM "orcamento_servico" WHERE id_grupo = 1 AND (status = 'RASCUNHO' OR status = 'ENVIADO' OR (status = 'APROVADO' AND (id_cobranca IS NULL OR id_cobranca = 0)))) as por_emb,
      (SELECT COUNT(*) FROM "orcamento_servico" WHERE status = 'ENVIADO' AND id_grupo = 1) as pend_aprov,
      (SELECT COUNT(*) FROM "orcamento_servico" WHERE status = 'APROVADO' AND id_grupo = 1 AND (id_cobranca IS NULL OR id_cobranca = 0)) as pend_cobr
  `,

  // Listar embarcações ALLMAX
  LISTAR_EMBARCACOES: `
    SELECT
      "Código" as codigo,
      "Num_PB" as numero_pb,
      "Nome_Embar" as nome
    FROM "P_BOAT_1_Embarcacao"
    WHERE "Cod_Cliente" = 4255
    ORDER BY "Num_PB"
  `,

  // Inserir orçamento
  INSERIR_ORCAMENTO: `
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
  `,

  // Inserir item
  INSERIR_ITEM: `
    INSERT INTO "orcamento_item" (
      "id_orcamento",
      "ordem",
      "descricao",
      "quantidade",
      "valor_unitario",
      "valor_total"
    ) VALUES ($1, $2, $3, 1, $4, $4)
  `
};

// ============================================================
// UTILITÁRIOS
// ============================================================

/**
 * Normaliza entrada de usuário (remove espaços extras, etc)
 */
export function normalizarEntrada(texto) {
  return texto.trim();
}

/**
 * Verifica se é comando de cancelamento
 */
export function isCancelar(texto) {
  return texto === '0' || texto.toLowerCase() === 'cancelar';
}

/**
 * Verifica se é comando de voltar
 */
export function isVoltar(texto) {
  return texto === '0' || texto.toLowerCase() === 'voltar';
}

export default {
  CONSTANTES,
  ESTADOS,
  QUERIES,
  gerarMenuPrincipal,
  gerarMenuEmbarcacoes,
  gerarMensagemTitulo,
  gerarMensagemDescricaoItem,
  gerarMensagemValorItem,
  gerarMenuItens,
  gerarResumoFinal,
  validarDescricao,
  validarValor,
  formatarMoeda,
  formatarNumeroOrcamento,
  calcularSubtotal,
  calcularTaxaGestao,
  calcularValores,
  criarEstadoInicial,
  criarNovoOrcamento,
  adicionarItem,
  gerarNumeroOrcamento,
  normalizarEntrada,
  isCancelar,
  isVoltar
};
