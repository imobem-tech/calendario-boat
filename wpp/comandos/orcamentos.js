// ============================================================
// wpp/comandos/orcamentos.js — V.2610241109
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

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
  const mensagem = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💼 *SISTEMA DE ORÇAMENTOS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Escolha uma opção:

1️⃣ ➕ *Criar Novo Orçamento*
2️⃣ 📋 *Consultar Orçamentos Abertos*
3️⃣ ✅ *Consultar Orçamentos Fechados*

0️⃣ Sair

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    // Buscar apenas embarcações ALLMAX (Cod_Cliente = 4255)
    const result = await pool.query(`
      SELECT
        "Código" as id,
        "Num_PB" as numero_pb,
        "Nome_Embarcação" as nome
      FROM "P_BOAT_1_Embarcacao"
      WHERE "Ativo" = TRUE
        AND "Cod_Cliente" = 4255
      ORDER BY "Num_PB"
    `);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: '❌ Nenhuma embarcação ALLMAX encontrada.'
      });
      return;
    }

    let mensagem = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚤 *SELECIONAR EMBARCAÇÃO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Escolha a embarcação:

`;

    result.rows.forEach((emb, index) => {
      mensagem += `${index + 1}️⃣ ${emb.numero_pb} - ${emb.nome}\n`;
    });

    mensagem += `\n0️⃣ Cancelar\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nDigite o número:`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado
    atualizarEstado(userId, {
      etapa: 'SELECIONAR_EMBARCACAO',
      embarcacoes: result.rows,
      orcamento: {}
    });

  } catch (error) {
    console.error('❌ Erro ao listar embarcações:', error);
    await sock.sendMessage(groupId, {
      text: '❌ Erro ao buscar embarcações. Tente novamente.'
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
  estado.orcamento.id_embarcacao = embarcacao.numero_pb;
  estado.orcamento.nome_embarcacao = embarcacao.nome;
  estado.etapa = 'TITULO';

  atualizarEstado(userId, estado);

  // Pedir título do orçamento
  const mensagem = `✅ Embarcação selecionada: ${embarcacao.numero_pb} (${embarcacao.nome})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 *PASSO 2/5: TÍTULO DO ORÇAMENTO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

  const mensagem = `✅ Embarcação: ${estado.orcamento.id_embarcacao} (${estado.orcamento.nome_embarcacao})
✅ Título: ${estado.orcamento.titulo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 *PASSO 3/5: ITENS DO ORÇAMENTO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *VALOR DO ITEM*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

  mensagem += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

🚤 Embarcação: ${orcamento.id_embarcacao} (${orcamento.nome_embarcacao})
📌 Título: ${orcamento.titulo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 *ITENS:*

`;

  orcamento.itens.forEach(item => {
    mensagem += `${item.ordem}. ${item.descricao.padEnd(25)} ${formatarMoeda(item.valor)}\n`;
  });

  mensagem += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *VALORES:*

Subtotal (itens).............. ${formatarMoeda(subtotal)}
Taxa de Gestão (${taxaGestaoPerc}%).......... ${formatarMoeda(taxaGestaoValor)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*TOTAL......................... ${formatarMoeda(total)}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

    // 1. Criar orçamento_servico
    // Usar campos existentes: descricao, valor_servicos, taxa_servico_perc, taxa_servico_valor, data_cadastro
    const orcamentoResult = await client.query(`
      INSERT INTO "orcamento_servico" (
        "id_embarcacao",
        "descricao",
        "valor_servicos",
        "taxa_servico_perc",
        "taxa_servico_valor",
        "valor_total",
        "status",
        "id_grupo",
        "data_cadastro"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ABERTO', 1, NOW() AT TIME ZONE 'America/Sao_Paulo')
      RETURNING "id_orcamento"
    `, [
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
🚤 Embarcação: ${orcamento.id_embarcacao}
💰 Valor Total: ${formatarMoeda(orcamento.valor_total)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
        // TODO: Consultar orçamentos abertos
        await sock.sendMessage(groupId, { text: '🚧 Em desenvolvimento...' });
        break;
      case '3':
        // TODO: Consultar orçamentos fechados
        await sock.sendMessage(groupId, { text: '🚧 Em desenvolvimento...' });
        break;
      case '0':
        limparEstado(userId);
        await sock.sendMessage(groupId, { text: '👋 Até logo!' });
        break;
      default:
        await sock.sendMessage(groupId, { text: '❌ Opção inválida! Digite 1, 2, 3 ou 0.' });
    }
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
