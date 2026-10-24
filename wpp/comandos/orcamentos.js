// ============================================================
// wpp/comandos/orcamentos.js — V.2610241544
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
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { put } from '@vercel/blob';

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

// Editar itens de orçamento já salvo no banco
async function editarItensOrcamento(sock, userId, groupId, idOrcamento) {
  try {
    console.log(`✏️ [ORCAMENTOS] Editando itens do orçamento #${idOrcamento}...`);

    // Buscar dados do orçamento
    const orcResult = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.status,
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

    // Verificar se orçamento pode ser editado
    if (orc.status === 'APROVADO' || orc.status === 'CONCLUIDO') {
      await sock.sendMessage(groupId, {
        text: `❌ *Orçamento não pode ser editado*\n\nStatus: ${orc.status}\n\nApenas orçamentos em RASCUNHO ou ENVIADO podem ser editados.\n\nDigite 0 para voltar.`
      });
      return;
    }

    // Buscar itens atuais
    const itensResult = await pool.query(`
      SELECT
        id_item,
        ordem,
        descricao,
        quantidade,
        valor_unitario,
        valor_total
      FROM "orcamento_item"
      WHERE id_orcamento = $1
      ORDER BY ordem
    `, [idOrcamento]);

    if (itensResult.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `📦 *EDITAR ITENS*\n━━━━━━━━━━━━━━━━\n🆔 Orçamento: ${orc.numero}\n━━━━━━━━━━━━━━━━\n\n❌ Nenhum item cadastrado.\n\n➕ Digite *A* para adicionar item\n0️⃣ Voltar`
      });

      atualizarEstado(userId, {
        etapa: 'EDITAR_ITENS_BANCO',
        id_orcamento: idOrcamento,
        itens: []
      });
      return;
    }

    let mensagem = `📦 *EDITAR ITENS*
━━━━━━━━━━━━━━━━
🆔 Orçamento: ${orc.numero}
🚤 ${orc.numero_pb}
━━━━━━━━━━━━━━━━

`;

    itensResult.rows.forEach(item => {
      mensagem += `${item.ordem}. ${item.descricao}\n   💰 ${formatarMoeda(item.valor_total)}\n\n`;
    });

    mensagem += `━━━━━━━━━━━━━━━━

*OPÇÕES:*

Digite o número do item para editar
➕ *A* - Adicionar novo item
🗑️ *E[número]* - Excluir (ex: E2)
✅ *S* - Salvar e voltar

0️⃣ Cancelar
━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(groupId, { text: mensagem });

    atualizarEstado(userId, {
      etapa: 'EDITAR_ITENS_BANCO',
      id_orcamento: idOrcamento,
      itens: itensResult.rows
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao editar itens:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao carregar itens.\n\n${error.message}`
    });
  }
}

// Adicionar item em orçamento já salvo
async function iniciarAdicaoItemBanco(sock, userId, groupId, estado) {
  const numeroItem = estado.itens.length + 1;

  const mensagem = `➕ *ADICIONAR ITEM*
━━━━━━━━━━━━━━━━
🆔 Orçamento: #${estado.id_orcamento}

*Item #${numeroItem}* - Digite a descrição:

💡 Exemplo: Troca de óleo do motor

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'ADICIONAR_ITEM_DESCRICAO',
    item_novo: { descricao: null, valor: null }
  });
}

async function receberDescricaoItemBanco(sock, userId, groupId, estado, descricao) {
  if (descricao === '0') {
    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);
    return;
  }

  // Validar descrição (mesma lógica da criação)
  if (!validarDescricao(descricao)) {
    const mensagem = `❌ *Descrição inválida!*

O item deve ter no mínimo *2 palavras de 3 ou mais caracteres* cada.

💡 Exemplo: Troca de óleo

Digite novamente:`;

    await sock.sendMessage(groupId, { text: mensagem });
    return;
  }

  const numeroItem = estado.itens.length + 1;

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

  atualizarEstado(userId, {
    ...estado,
    etapa: 'ADICIONAR_ITEM_VALOR',
    item_novo: { descricao, valor: null }
  });
}

async function salvarNovoItemBanco(sock, userId, groupId, estado, valorTexto) {
  if (valorTexto === '0') {
    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);
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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const numeroItem = estado.itens.length + 1;

    // Inserir novo item
    await client.query(`
      INSERT INTO "orcamento_item" (
        id_orcamento,
        ordem,
        descricao,
        quantidade,
        valor_unitario,
        valor_total
      ) VALUES ($1, $2, $3, 1, $4, $4)
    `, [estado.id_orcamento, numeroItem, estado.item_novo.descricao, valor || 0]);

    // Recalcular total do orçamento
    const totalResult = await client.query(`
      SELECT COALESCE(SUM(valor_total), 0) as total_itens
      FROM "orcamento_item"
      WHERE id_orcamento = $1
    `, [estado.id_orcamento]);

    const totalItens = parseFloat(totalResult.rows[0].total_itens);
    const taxaPerc = 20;
    const taxaValor = totalItens * (taxaPerc / 100);
    const valorTotal = totalItens + taxaValor;

    await client.query(`
      UPDATE "orcamento_servico"
      SET
        valor_servicos = $1,
        taxa_servico_valor = $2,
        valor_total = $3
      WHERE id_orcamento = $4
    `, [totalItens, taxaValor, valorTotal, estado.id_orcamento]);

    await client.query('COMMIT');

    // Registrar no log
    await adicionarLog(
      estado.id_orcamento,
      'ITEM_ADICIONADO',
      `Item #${numeroItem}: ${estado.item_novo.descricao} - ${formatarMoeda(valor || 0)}`,
      userId
    );

    await sock.sendMessage(groupId, {
      text: `✅ *Item adicionado com sucesso!*

📦 Item #${numeroItem}: ${estado.item_novo.descricao}
💰 ${formatarMoeda(valor || 0)}

Carregando lista atualizada...`
    });

    // Recarregar lista de itens
    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ORCAMENTOS] Erro ao adicionar item:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao adicionar item.\n\n${error.message}`
    });
  } finally {
    client.release();
  }
}

// Editar item específico
async function iniciarEdicaoItemBanco(sock, userId, groupId, estado, numeroItem) {
  const item = estado.itens.find(i => i.ordem === numeroItem);

  if (!item) {
    await sock.sendMessage(groupId, {
      text: `❌ Item #${numeroItem} não encontrado.`
    });
    return;
  }

  const mensagem = `✏️ *EDITAR ITEM #${numeroItem}*
━━━━━━━━━━━━━━━━

*Atual:*
📦 ${item.descricao}
💰 ${formatarMoeda(item.valor_total)}

━━━━━━━━━━━━━━━━

*OPÇÕES:*

1️⃣ Editar descrição
2️⃣ Editar valor
0️⃣ Cancelar

━━━━━━━━━━━━━━━━
Digite a opção:`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'EDITAR_ITEM_MENU',
    item_editando: item
  });
}

async function escolherCampoEdicao(sock, userId, groupId, estado, opcao) {
  if (opcao === '0') {
    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);
    return;
  }

  const item = estado.item_editando;

  switch (opcao) {
    case '1': // Editar descrição
      const mensagemDesc = `✏️ *EDITAR DESCRIÇÃO*
━━━━━━━━━━━━━━━━
Item #${item.ordem}

*Descrição atual:*
${item.descricao}

━━━━━━━━━━━━━━━━

Digite a nova descrição:

💡 Exemplo: Troca de óleo do motor

0️⃣ Cancelar`;

      await sock.sendMessage(groupId, { text: mensagemDesc });

      atualizarEstado(userId, {
        ...estado,
        etapa: 'EDITAR_ITEM_DESCRICAO'
      });
      break;

    case '2': // Editar valor
      const mensagemValor = `✏️ *EDITAR VALOR*
━━━━━━━━━━━━━━━━
Item #${item.ordem}
${item.descricao}

*Valor atual:*
${formatarMoeda(item.valor_total)}

━━━━━━━━━━━━━━━━

Digite o novo valor:

💡 Formatos aceitos:
• 500
• 500,50
• 5.000,50
• 5000,5

0️⃣ Cancelar`;

      await sock.sendMessage(groupId, { text: mensagemValor });

      atualizarEstado(userId, {
        ...estado,
        etapa: 'EDITAR_ITEM_VALOR'
      });
      break;

    default:
      await sock.sendMessage(groupId, {
        text: '❌ Opção inválida! Digite 1, 2 ou 0.'
      });
  }
}

async function salvarDescricaoItemBanco(sock, userId, groupId, estado, novaDescricao) {
  if (novaDescricao === '0') {
    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);
    return;
  }

  // Validar descrição
  if (!validarDescricao(novaDescricao)) {
    const mensagem = `❌ *Descrição inválida!*

O item deve ter no mínimo *2 palavras de 3 ou mais caracteres* cada.

💡 Exemplo: Troca de óleo

Digite novamente:`;

    await sock.sendMessage(groupId, { text: mensagem });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const item = estado.item_editando;
    const descricaoAnterior = item.descricao;

    // Atualizar descrição
    await client.query(`
      UPDATE "orcamento_item"
      SET descricao = $1
      WHERE id_item = $2
    `, [novaDescricao, item.id_item]);

    await client.query('COMMIT');

    // Registrar no log
    await adicionarLog(
      estado.id_orcamento,
      'ITEM_EDITADO',
      `Item #${item.ordem}: Descrição alterada de "${descricaoAnterior}" para "${novaDescricao}"`,
      userId
    );

    await sock.sendMessage(groupId, {
      text: `✅ *Descrição atualizada!*

*Antes:* ${descricaoAnterior}
*Depois:* ${novaDescricao}

Carregando lista...`
    });

    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ORCAMENTOS] Erro ao editar descrição:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao atualizar descrição.\n\n${error.message}`
    });
  } finally {
    client.release();
  }
}

async function salvarValorItemBanco(sock, userId, groupId, estado, valorTexto) {
  if (valorTexto === '0') {
    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);
    return;
  }

  const valor = formatarValor(valorTexto);

  if (valor === 'ERRO_FORMATO') {
    const mensagem = `❌ *Formato inválido!*

Use *VÍRGULA* para separar centavos.

💡 Correto: 5000,50
❌ Errado: 5000.50

Digite novamente:`;

    await sock.sendMessage(groupId, { text: mensagem });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const item = estado.item_editando;
    const valorAnterior = item.valor_total;

    // Atualizar valor (tanto unitário quanto total, já que qtd = 1)
    await client.query(`
      UPDATE "orcamento_item"
      SET
        valor_unitario = $1,
        valor_total = $1
      WHERE id_item = $2
    `, [valor, item.id_item]);

    // Recalcular total do orçamento
    const totalResult = await client.query(`
      SELECT COALESCE(SUM(valor_total), 0) as total_itens
      FROM "orcamento_item"
      WHERE id_orcamento = $1
    `, [estado.id_orcamento]);

    const totalItens = parseFloat(totalResult.rows[0].total_itens);
    const taxaPerc = 20;
    const taxaValor = totalItens * (taxaPerc / 100);
    const valorTotal = totalItens + taxaValor;

    await client.query(`
      UPDATE "orcamento_servico"
      SET
        valor_servicos = $1,
        taxa_servico_valor = $2,
        valor_total = $3
      WHERE id_orcamento = $4
    `, [totalItens, taxaValor, valorTotal, estado.id_orcamento]);

    await client.query('COMMIT');

    // Registrar no log
    await adicionarLog(
      estado.id_orcamento,
      'ITEM_EDITADO',
      `Item #${item.ordem}: Valor alterado de ${formatarMoeda(valorAnterior)} para ${formatarMoeda(valor)}`,
      userId
    );

    await sock.sendMessage(groupId, {
      text: `✅ *Valor atualizado!*

📦 ${item.descricao}

*Antes:* ${formatarMoeda(valorAnterior)}
*Depois:* ${formatarMoeda(valor)}

Carregando lista...`
    });

    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ORCAMENTOS] Erro ao editar valor:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao atualizar valor.\n\n${error.message}`
    });
  } finally {
    client.release();
  }
}

async function excluirItemOrcamento(sock, userId, groupId, estado, numeroItem) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const item = estado.itens.find(i => i.ordem === numeroItem);

    if (!item) {
      await sock.sendMessage(groupId, {
        text: `❌ Item #${numeroItem} não encontrado.`
      });
      return;
    }

    // Excluir item
    await client.query(`
      DELETE FROM "orcamento_item"
      WHERE id_item = $1
    `, [item.id_item]);

    // Reordenar itens restantes
    await client.query(`
      UPDATE "orcamento_item"
      SET ordem = ordem - 1
      WHERE id_orcamento = $1
        AND ordem > $2
    `, [estado.id_orcamento, numeroItem]);

    // Recalcular total do orçamento
    const totalResult = await client.query(`
      SELECT COALESCE(SUM(valor_total), 0) as total_itens
      FROM "orcamento_item"
      WHERE id_orcamento = $1
    `, [estado.id_orcamento]);

    const totalItens = parseFloat(totalResult.rows[0].total_itens);
    const taxaPerc = 20; // Taxa fixa de 20%
    const taxaValor = totalItens * (taxaPerc / 100);
    const valorTotal = totalItens + taxaValor;

    await client.query(`
      UPDATE "orcamento_servico"
      SET
        valor_servicos = $1,
        taxa_servico_valor = $2,
        valor_total = $3
      WHERE id_orcamento = $4
    `, [totalItens, taxaValor, valorTotal, estado.id_orcamento]);

    await client.query('COMMIT');

    // Registrar no log
    await adicionarLog(
      estado.id_orcamento,
      'ITEM_EXCLUIDO',
      `Item #${numeroItem}: ${item.descricao} - ${formatarMoeda(item.valor_total)}`,
      userId
    );

    await sock.sendMessage(groupId, {
      text: `✅ *Item excluído com sucesso!*\n\n📦 Item #${numeroItem}: ${item.descricao}\n\nCarregando lista atualizada...`
    });

    // Recarregar lista de itens
    await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ORCAMENTOS] Erro ao excluir item:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao excluir item.\n\n${error.message}`
    });
  } finally {
    client.release();
  }
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

    // Registrar criação do orçamento no log
    await adicionarLog(
      idOrcamento,
      'ORCAMENTO_CRIADO',
      `Título: ${orcamento.titulo}\nEmbarcação: ${orcamento.numero_pb}\nValor Total: ${formatarMoeda(orcamento.valor_total)}\nItens: ${orcamento.itens.length}`,
      userId
    );

    // Registrar cada item adicionado no log
    for (const item of orcamento.itens) {
      await adicionarLog(
        idOrcamento,
        'ITEM_ADICIONADO',
        `Item #${item.ordem}: ${item.descricao} - ${formatarMoeda(item.valor || 0)}`,
        userId
      );
    }

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
// SISTEMA DE LOG (OBSERVAÇÕES PRIVADAS)
// ============================================================

/**
 * Adiciona entrada no log do orçamento
 * @param {number} idOrcamento - ID do orçamento
 * @param {string} mensagem - Mensagem do log
 * @param {string} usuario - Telefone do usuário (sem @s.whatsapp.net)
 */
async function adicionarLog(idOrcamento, acao, descricao, usuario) {
  try {
    // Limpar telefone: remover @s.whatsapp.net e caracteres não numéricos
    let telefone = usuario.replace('@s.whatsapp.net', '').replace(/\D/g, '');

    // Se tiver mais de 11 dígitos, pegar apenas os últimos 11 (padrão BR: DDD + número)
    if (telefone.length > 11) {
      telefone = telefone.slice(-11);
    }

    await pool.query(`
      INSERT INTO "orcamento_log" (
        "id_orcamento",
        "acao",
        "descricao",
        "data_hora",
        "ip_origem"
      ) VALUES ($1, $2, $3, NOW() AT TIME ZONE 'America/Sao_Paulo', $4)
    `, [idOrcamento, acao, descricao, telefone]);

    console.log(`📝 [LOG] Orçamento #${idOrcamento}: ${acao}`);
  } catch (error) {
    console.error('❌ [LOG] Erro ao adicionar log:', error);
  }
}

/**
 * Busca e formata todos os logs de um orçamento
 * @param {number} idOrcamento - ID do orçamento
 * @returns {string} - Logs formatados
 */
async function buscarLogs(idOrcamento) {
  try {
    const result = await pool.query(`
      SELECT
        data_hora,
        acao,
        descricao,
        ip_origem as usuario
      FROM "orcamento_log"
      WHERE id_orcamento = $1
      ORDER BY data_hora DESC
    `, [idOrcamento]);

    if (result.rows.length === 0) {
      return '(nenhum registro de log)';
    }

    let logs = '';
    result.rows.forEach(log => {
      const data = new Date(log.data_hora);
      const dataFormatada = `${data.getFullYear()}/${String(data.getMonth() + 1).padStart(2, '0')}/${String(data.getDate()).padStart(2, '0')}-${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;

      logs += `━━━━━━━━━━━━━━━━
${dataFormatada}
${log.descricao || log.acao}
USR: ${log.usuario || '(sistema)'}
`;
    });

    logs += `━━━━━━━━━━━━━━━━`;

    return logs;
  } catch (error) {
    console.error('❌ [LOG] Erro ao buscar logs:', error);
    return '(erro ao carregar logs)';
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
      mensagem += `   📝 ${orc.titulo || '(sem título)'}\n`;
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

    // Buscar orçamentos APROVADOS
    // TODO: Implementar vínculo com Contas_Receber quando campo estiver criado
    const result = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_total,
        os.status,
        os.data_orcamento,
        os.id_cobranca,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao,
        CURRENT_DATE - os.data_orcamento::date as dias_aprovado
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

    // Filtrar apenas os que NÃO têm cobrança (id_cobranca NULL ou 0)
    const pendentes = result.rows.filter(orc => !orc.id_cobranca || orc.id_cobranca === 0);

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

async function mostrarMenuHistorico(sock, userId, groupId, idOrcamento) {
  try {
    console.log(`📋 [ORCAMENTOS] Menu histórico do orçamento #${idOrcamento}...`);

    // Buscar dados básicos do orçamento
    const orcResult = await pool.query(`
      SELECT
        os.numero,
        os.descricao as titulo,
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

    const mensagem = `━━━━━━━━━━━━━━━━
📋 *HISTÓRICO E ANEXOS*
━━━━━━━━━━━━━━━━
🆔 ${orc.numero}
📝 ${orc.titulo || '(sem título)'}
🚤 ${orc.numero_pb}
━━━━━━━━━━━━━━━━

*OPÇÕES:*

1️⃣ 📜 Ver LOG (histórico)
2️⃣ 📝 Registrar observação privada
3️⃣ 📎 Inserir anexo
4️⃣ 📂 Ver anexos
0️⃣ 🔙 Voltar

━━━━━━━━━━━━━━━━
Digite o número da opção:`;

    await sock.sendMessage(groupId, { text: mensagem });

    atualizarEstado(userId, {
      etapa: 'MENU_HISTORICO',
      id_orcamento: idOrcamento,
      orcamento_dados: orc
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao mostrar menu histórico:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao carregar menu.\n\n${error.message}`
    });
  }
}

async function mostrarHistoricoOrcamento(sock, userId, groupId, idOrcamento) {
  try {
    const logs = await buscarLogs(idOrcamento);

    const mensagem = `━━━━━━━━━━━━━━━━
📜 *LOG (HISTÓRICO)*
━━━━━━━━━━━━━━━━

${logs}

━━━━━━━━━━━━━━━━
Digite 0 para voltar ao menu.`;

    await sock.sendMessage(groupId, { text: mensagem });

    atualizarEstado(userId, {
      etapa: 'VISUALIZAR_LOG',
      id_orcamento: idOrcamento
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao buscar histórico:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar histórico.\n\n${error.message}`
    });
  }
}

// ============================================================
// SISTEMA DE ANEXOS
// ============================================================

async function iniciarInsercaoAnexo(sock, userId, groupId, estado) {
  await sock.sendMessage(groupId, {
    text: `📎 *INSERIR ANEXO*
━━━━━━━━━━━━━━━━

Envie o arquivo que deseja anexar ao orçamento:

📷 Foto
📄 Documento (PDF, Word, etc)
🎥 Vídeo
🎵 Áudio

0️⃣ Cancelar`
  });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'AGUARDANDO_ANEXO'
  });
}

async function processarAnexoOrcamento(sock, userId, groupId, mensagem) {
  try {
    const estado = obterEstado(userId);
    const tipoMensagem = Object.keys(mensagem.message || {})[0];

    console.log(`📎 [ORCAMENTOS] Processando anexo tipo: ${tipoMensagem}`);

    // Baixar mídia
    const buffer = await downloadMediaMessage(
      mensagem,
      'buffer',
      {},
      { logger: console, reuploadRequest: sock.updateMediaMessage }
    );

    // Detectar tipo de arquivo
    let extensao = 'bin';
    let nomeOriginal = 'arquivo';

    if (tipoMensagem === 'imageMessage') {
      extensao = 'jpg';
      nomeOriginal = mensagem.message.imageMessage.caption || 'imagem';
    } else if (tipoMensagem === 'documentMessage') {
      const doc = mensagem.message.documentMessage;
      nomeOriginal = doc.fileName || 'documento';
      extensao = nomeOriginal.split('.').pop() || 'pdf';
    } else if (tipoMensagem === 'videoMessage') {
      extensao = 'mp4';
      nomeOriginal = 'video';
    } else if (tipoMensagem === 'audioMessage') {
      extensao = 'ogg';
      nomeOriginal = 'audio';
    }

    await sock.sendMessage(groupId, {
      text: `✅ Arquivo recebido! (${(buffer.length / 1024).toFixed(1)} KB)\n\nProcessando...`
    });

    // Armazenar no estado temporariamente
    atualizarEstado(userId, {
      ...estado,
      etapa: 'AGUARDANDO_NOME_ANEXO',
      anexo_buffer: buffer,
      anexo_extensao: extensao,
      anexo_nome_original: nomeOriginal,
      anexo_tamanho: buffer.length
    });

    await solicitarNomeAnexo(sock, userId, groupId, estado);

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao processar anexo:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao processar anexo.\n\n${error.message}`
    });
  }
}

async function solicitarNomeAnexo(sock, userId, groupId, estado) {
  const mensagem = `📎 *NOME DO ANEXO*
━━━━━━━━━━━━━━━━

Digite um nome amigável para este anexo:

💡 Exemplo: "Orçamento fornecedor XYZ", "Foto do problema"

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });
}

async function solicitarVisibilidadeAnexo(sock, userId, groupId, estado, nomeAnexo) {
  const mensagem = `👁️ *VISIBILIDADE DO ANEXO*
━━━━━━━━━━━━━━━━

📎 ${nomeAnexo}

Este anexo será visível para o cliente?

1️⃣ 👁️ SIM - Cliente pode ver
2️⃣ 🔒 NÃO - Apenas gestores

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'AGUARDANDO_VISIBILIDADE_ANEXO',
    anexo_nome_amigavel: nomeAnexo
  });
}

async function finalizarUploadAnexo(sock, userId, groupId, estado, visivelCliente) {
  try {
    await sock.sendMessage(groupId, {
      text: '⏳ Fazendo upload do arquivo...'
    });

    // Upload para Vercel Blob
    const timestamp = Date.now();
    const nomeArquivo = `orc_${estado.id_orcamento}_${timestamp}.${estado.anexo_extensao}`;
    const blobPath = `orcamentos/${estado.id_orcamento}/${nomeArquivo}`;

    const blob = await put(blobPath, estado.anexo_buffer, {
      access: 'public',
      addRandomSuffix: false
    });

    console.log(`✅ [ORCAMENTOS] Upload concluído: ${blob.url}`);

    // Salvar no banco
    const dados = {
      nome_amigavel: estado.anexo_nome_amigavel,
      nome_arquivo: nomeArquivo,
      url_arquivo: blob.url,
      visivel_cliente: visivelCliente,
      tipo_arquivo: estado.anexo_extensao,
      tamanho: estado.anexo_tamanho
    };

    await salvarAnexoBanco(estado.id_orcamento, dados, userId);

    await sock.sendMessage(groupId, {
      text: `✅ *Anexo salvo com sucesso!*

📎 ${estado.anexo_nome_amigavel}
${visivelCliente ? '👁️ Visível para cliente' : '🔒 Privado (apenas gestores)'}

Voltando ao menu...`
    });

    await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao finalizar upload:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao salvar anexo.\n\n${error.message}`
    });
  }
}

async function salvarAnexoBanco(idOrcamento, dados, userId) {
  try {
    // Limpar telefone
    let telefone = userId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (telefone.length > 11) {
      telefone = telefone.slice(-11);
    }

    const result = await pool.query(`
      INSERT INTO orcamento_anexo (
        id_orcamento,
        nome_amigavel,
        nome_arquivo,
        url_arquivo,
        visivel_cliente,
        tipo_arquivo,
        tamanho,
        usuario_upload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id_anexo
    `, [
      idOrcamento,
      dados.nome_amigavel,
      dados.nome_arquivo,
      dados.url_arquivo,
      dados.visivel_cliente,
      dados.tipo_arquivo,
      dados.tamanho,
      telefone
    ]);

    // Adicionar LOG
    await adicionarLog(
      idOrcamento,
      'ANEXO_ADICIONADO',
      `${dados.nome_amigavel} (${dados.visivel_cliente ? 'Visível' : 'Privado'})`,
      userId
    );

    console.log(`✅ [ORCAMENTOS] Anexo salvo no banco: ID ${result.rows[0].id_anexo}`);
    return result.rows[0].id_anexo;

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao salvar anexo:', error);
    throw error;
  }
}

async function listarAnexosOrcamento(sock, userId, groupId, idOrcamento) {
  try {
    const result = await pool.query(`
      SELECT
        id_anexo,
        nome_amigavel,
        nome_arquivo,
        url_arquivo,
        visivel_cliente,
        tipo_arquivo,
        tamanho,
        data_upload,
        usuario_upload
      FROM orcamento_anexo
      WHERE id_orcamento = $1
      ORDER BY data_upload DESC
    `, [idOrcamento]);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `📂 *ANEXOS*
━━━━━━━━━━━━━━━━

⚠️ Nenhum anexo encontrado.

━━━━━━━━━━━━━━━━
Digite 0 para voltar.`
      });

      atualizarEstado(userId, {
        etapa: 'VER_ANEXOS_VAZIO',
        id_orcamento: idOrcamento
      });
      return;
    }

    let mensagem = `📂 *ANEXOS*
━━━━━━━━━━━━━━━━
🆔 Orçamento: #${idOrcamento}
📎 Total: ${result.rows.length}
━━━━━━━━━━━━━━━━

`;

    result.rows.forEach((anexo, index) => {
      const data = new Date(anexo.data_upload).toLocaleDateString('pt-BR');
      const visibilidade = anexo.visivel_cliente ? '👁️ Visível' : '🔒 Privado';
      const tamanhoKB = (anexo.tamanho / 1024).toFixed(1);

      mensagem += `${index + 1}️⃣ ${anexo.nome_amigavel}
   ${visibilidade} | ${tamanhoKB} KB
   📅 ${data}
   🔗 ${anexo.url_arquivo}

`;
    });

    mensagem += `━━━━━━━━━━━━━━━━
Digite o número para opções
ou 0 para voltar.`;

    await sock.sendMessage(groupId, { text: mensagem });

    atualizarEstado(userId, {
      etapa: 'VER_ANEXOS',
      id_orcamento: idOrcamento,
      anexos: result.rows
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar anexos:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao listar anexos.\n\n${error.message}`
    });
  }
}

// ============================================================
// DETALHES DO ORÇAMENTO
// ============================================================

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
      mensagem += '(nenhum item cadastrado)\n';
    } else {
      itensResult.rows.forEach(item => {
        mensagem += `${item.ordem}. ${item.descricao}\n`;
        mensagem += `   ${formatarMoeda(item.valor_total)}\n`;
      });
    }

    mensagem += `━━━━━━━━━━━━━━━━
💰 *VALORES:*
Subtotal: ${formatarMoeda(orc.subtotal)}
Taxa gestão (${orc.taxa_servico_perc}%): ${formatarMoeda(orc.taxa_servico_valor)}
*TOTAL: ${formatarMoeda(orc.valor_total)}*
━━━━━━━━━━━━━━━━

*OPÇÕES:*

1️⃣ 📋 Acessar HISTÓRICO (LOG)
2️⃣ ✏️ Editar itens
3️⃣ 📊 Definir rateio
4️⃣ ✅ Aprovar orçamento
5️⃣ 💵 Enviar cobrança
0️⃣ 🔙 Voltar

━━━━━━━━━━━━━━━━
Digite o número da opção:`;

    await sock.sendMessage(groupId, { text: mensagem });

    // Atualizar estado para processar submenu
    atualizarEstado(userId, {
      etapa: 'SUBMENU_DETALHES',
      id_orcamento: idOrcamento,
      orcamento_dados: orc
    });

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

  // PROCESSAR MÍDIA (anexos)
  if (estado.etapa === 'AGUARDANDO_ANEXO') {
    // Verificar se é mensagem de mídia
    if (typeof mensagem === 'object' && mensagem.message) {
      const tipoMensagem = Object.keys(mensagem.message)[0];

      if (['imageMessage', 'documentMessage', 'videoMessage', 'audioMessage'].includes(tipoMensagem)) {
        await processarAnexoOrcamento(sock, userId, groupId, mensagem);
        return;
      }
    }
  }

  const texto = mensagem.trim ? mensagem.trim() : String(mensagem);

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

  // Submenu de detalhes do orçamento
  if (estado.etapa === 'SUBMENU_DETALHES') {
    if (texto === '0') {
      await mostrarMenuOrcamentos(sock, userId, groupId);
      return;
    }

    switch (texto) {
      case '1': // Acessar HISTÓRICO (LOG)
        await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
        break;

      case '2': // Editar itens
        await editarItensOrcamento(sock, userId, groupId, estado.id_orcamento);
        break;

      case '3': // Definir rateio
        await sock.sendMessage(groupId, {
          text: '🚧 *Definir rateio* - Funcionalidade em desenvolvimento.\n\nDigite 0 para voltar.'
        });
        break;

      case '4': // Aprovar orçamento
        await sock.sendMessage(groupId, {
          text: '🚧 *Aprovar orçamento* - Funcionalidade em desenvolvimento.\n\nDigite 0 para voltar.'
        });
        break;

      case '5': // Enviar cobrança
        await sock.sendMessage(groupId, {
          text: '🚧 *Enviar cobrança* - Funcionalidade em desenvolvimento.\n\nDigite 0 para voltar.'
        });
        break;

      default:
        await sock.sendMessage(groupId, {
          text: '❌ Opção inválida! Digite 1, 2, 3, 4, 5 ou 0.'
        });
    }
    return;
  }

  // Menu de histórico e anexos
  if (estado.etapa === 'MENU_HISTORICO') {
    if (texto === '0') {
      await verDetalhesOrcamento(sock, userId, groupId, estado.id_orcamento);
      return;
    }

    switch (texto) {
      case '1': // Ver LOG
        await mostrarHistoricoOrcamento(sock, userId, groupId, estado.id_orcamento);
        break;

      case '2': // Registrar observação
        await sock.sendMessage(groupId, {
          text: `📝 *REGISTRAR OBSERVAÇÃO PRIVADA*\n━━━━━━━━━━━━━━━━\n\nDigite a observação que deseja registrar:\n\n💡 Será registrado como LOG privado\n\n0️⃣ Cancelar`
        });
        atualizarEstado(userId, {
          ...estado,
          etapa: 'REGISTRAR_OBSERVACAO'
        });
        break;

      case '3': // Inserir anexo
        await iniciarInsercaoAnexo(sock, userId, groupId, estado);
        break;

      case '4': // Ver anexos
        await listarAnexosOrcamento(sock, userId, groupId, estado.id_orcamento);
        break;

      default:
        await sock.sendMessage(groupId, {
          text: '❌ Opção inválida! Digite 1, 2, 3, 4 ou 0.'
        });
    }
    return;
  }

  // Visualizar LOG
  if (estado.etapa === 'VISUALIZAR_LOG') {
    if (texto === '0') {
      await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
      return;
    }
    await sock.sendMessage(groupId, {
      text: '❌ Digite 0 para voltar ao menu.'
    });
    return;
  }

  // Registrar observação privada
  if (estado.etapa === 'REGISTRAR_OBSERVACAO') {
    if (texto === '0') {
      await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
      return;
    }

    // Salvar observação como LOG
    await adicionarLog(
      estado.id_orcamento,
      'OBSERVACAO_PRIVADA',
      texto,
      userId
    );

    await sock.sendMessage(groupId, {
      text: `✅ *Observação registrada com sucesso!*\n\n📝 ${texto}\n\nVoltando ao menu...`
    });

    await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
    return;
  }

  // Aguardando nome do anexo
  if (estado.etapa === 'AGUARDANDO_NOME_ANEXO') {
    if (texto === '0') {
      await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
      return;
    }

    await solicitarVisibilidadeAnexo(sock, userId, groupId, estado, texto);
    return;
  }

  // Aguardando visibilidade do anexo
  if (estado.etapa === 'AGUARDANDO_VISIBILIDADE_ANEXO') {
    if (texto === '0') {
      await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
      return;
    }

    if (texto === '1' || texto === '2') {
      const visivelCliente = texto === '1';
      await finalizarUploadAnexo(sock, userId, groupId, estado, visivelCliente);
      return;
    }

    await sock.sendMessage(groupId, {
      text: '❌ Opção inválida! Digite 1 (Visível) ou 2 (Privado).'
    });
    return;
  }

  // Ver anexos
  if (estado.etapa === 'VER_ANEXOS' || estado.etapa === 'VER_ANEXOS_VAZIO') {
    if (texto === '0') {
      await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
      return;
    }

    // TODO: Implementar opções de anexo individual (baixar, deletar, etc)
    await sock.sendMessage(groupId, {
      text: '❌ Digite 0 para voltar ao menu.'
    });
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
      // TODO: Implementar edição de itens (durante criação)
      await sock.sendMessage(groupId, { text: '🚧 Edição em desenvolvimento. Digite F para finalizar.' });
      break;

    case 'EDITAR_ITENS_BANCO':
      // Edição de itens de orçamento já salvo
      const textoUpper = texto.toUpperCase();

      if (texto === '0') {
        await verDetalhesOrcamento(sock, userId, groupId, estado.id_orcamento);
        return;
      }

      // Adicionar item
      if (textoUpper === 'A') {
        await iniciarAdicaoItemBanco(sock, userId, groupId, estado);
        break;
      }

      // Salvar e voltar
      if (textoUpper === 'S') {
        await sock.sendMessage(groupId, {
          text: '✅ Alterações salvas!\n\nCarregando detalhes...'
        });
        await verDetalhesOrcamento(sock, userId, groupId, estado.id_orcamento);
        break;
      }

      // Excluir item (Ex: E2)
      if (textoUpper.startsWith('E')) {
        const numeroStr = textoUpper.substring(1);
        const numero = parseInt(numeroStr);

        if (isNaN(numero) || numero < 1) {
          await sock.sendMessage(groupId, {
            text: '❌ Formato inválido!\n\nUse: E[número]\nExemplo: E2 para excluir item 2'
          });
          break;
        }

        await excluirItemOrcamento(sock, userId, groupId, estado, numero);
        break;
      }

      // Editar item (número do item)
      const numeroItem = parseInt(texto);
      if (!isNaN(numeroItem) && numeroItem >= 1 && numeroItem <= estado.itens.length) {
        await iniciarEdicaoItemBanco(sock, userId, groupId, estado, numeroItem);
        break;
      }

      await sock.sendMessage(groupId, {
        text: '❌ Opção inválida!\n\nDigite:\n• Número do item para editar\n• A para adicionar\n• E[número] para excluir\n• S para salvar\n• 0 para voltar'
      });
      break;

    case 'CONFIRMAR':
      await processarConfirmacao(sock, userId, groupId, texto);
      break;

    case 'ADICIONAR_ITEM_DESCRICAO':
      await receberDescricaoItemBanco(sock, userId, groupId, estado, texto);
      break;

    case 'ADICIONAR_ITEM_VALOR':
      await salvarNovoItemBanco(sock, userId, groupId, estado, texto);
      break;

    case 'EDITAR_ITEM_MENU':
      await escolherCampoEdicao(sock, userId, groupId, estado, texto);
      break;

    case 'EDITAR_ITEM_DESCRICAO':
      await salvarDescricaoItemBanco(sock, userId, groupId, estado, texto);
      break;

    case 'EDITAR_ITEM_VALOR':
      await salvarValorItemBanco(sock, userId, groupId, estado, texto);
      break;

    default:
      await mostrarMenuOrcamentos(sock, userId, groupId);
  }
}

// V.2610241544
