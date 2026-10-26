#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Modificar adicionarItemOrcamento para pedir descrição e valor em 2 etapas
"""

import re

arquivo = 'wpp/comandos/orcamentos.js'

# Ler arquivo
with open(arquivo, 'r', encoding='utf-8') as f:
    conteudo = f.read()

print("📝 Modificando adicionarItemOrcamento...")

# Encontrar e substituir a função adicionarItemOrcamento
# Ela agora só vai pedir a descrição primeiro
inicio = conteudo.find('async function adicionarItemOrcamento(')
if inicio == -1:
    print("❌ Função adicionarItemOrcamento não encontrada!")
    exit(1)

fim = conteudo.find('\nasync function', inicio + 100)
if fim == -1:
    fim = conteudo.find('\n\n// ============================================================', inicio)

# Nova versão - PASSO 1: Pedir descrição
nova_funcao_desc = '''async function pedirDescricaoNovoItem(sock, userId, groupId, estado) {
  const mensagem = `━━━━━━━━━━━━━━━━
➕ *ADICIONAR ITEM*
━━━━━━━━━━━━━━━━
Passo 1/2: Digite a descrição do item:

Exemplo: Troca de óleo

0️⃣ Digite 0 para cancelar
━━━━━━━━━━━━━━━━`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'ADICIONAR_ITEM_DESCRICAO'
  });
}

async function receberDescricaoNovoItem(sock, userId, groupId, estado, descricao) {
  // Validar descrição
  if (!validarDescricao(descricao)) {
    await sock.sendMessage(groupId, {
      text: '❌ Descrição inválida!\\n\\nMínimo: 2 palavras de 3+ caracteres.\\n\\nExemplo: Troca de óleo'
    });
    return;
  }

  const mensagem = `━━━━━━━━━━━━━━━━
➕ *ADICIONAR ITEM*
━━━━━━━━━━━━━━━━
✅ Descrição: ${descricao}

Passo 2/2: Digite o valor:

Formatos aceitos:
• 500
• 500,50
• 5.000,50

0️⃣ Digite 0 para cancelar
━━━━━━━━━━━━━━━━`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'ADICIONAR_ITEM_VALOR',
    item_novo: { descricao }
  });
}

async function receberValorNovoItem(sock, userId, groupId, estado, valorTexto) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const idOrcamento = estado.orcamento.id;
    const descricao = estado.item_novo.descricao;

    // Validar e formatar valor
    const valor = formatarValor(valorTexto);
    if (valor === null) {
      await sock.sendMessage(groupId, {
        text: '❌ Valor inválido!\\n\\nFormatos aceitos:\\n• 500\\n• 500,50\\n• 5.000,50'
      });
      await client.query('ROLLBACK');
      return;
    }

    // Pegar próxima ordem
    const ordemResult = await client.query(`
      SELECT COALESCE(MAX(ordem), 0) + 1 as proxima_ordem
      FROM "orcamento_item"
      WHERE id_orcamento = $1
    `, [idOrcamento]);

    const ordem = ordemResult.rows[0].proxima_ordem;

    // Inserir item
    await client.query(`
      INSERT INTO "orcamento_item" (
        "id_orcamento",
        "ordem",
        "descricao",
        "quantidade",
        "valor_unitario",
        "valor_total"
      ) VALUES ($1, $2, $3, 1, $4, $4)
    `, [idOrcamento, ordem, descricao, valor]);

    // Recalcular totais
    const totais = await recalcularTotaisOrcamento(idOrcamento);

    // Log
    await adicionarLog(
      idOrcamento,
      'ITEM_ADICIONADO',
      `Inserido item: ${descricao} ${formatarMoeda(valor)}`,
      userId
    );

    await client.query('COMMIT');

    await sock.sendMessage(groupId, {
      text: `✅ *ITEM ADICIONADO!*
━━━━━━━━━━━━━━━━
📦 ${descricao}
💰 ${formatarMoeda(valor)}
━━━━━━━━━━━━━━━━
*TOTAIS ATUALIZADOS:*
Subtotal: ${formatarMoeda(totais.subtotal)}
Taxa (${totais.taxaPerc}%): ${formatarMoeda(totais.taxaValor)}
*Total: ${formatarMoeda(totais.valorTotal)}*
━━━━━━━━━━━━━━━━
Digite *menu* para voltar.`
    });

    limparEstado(userId);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [GERENCIAR] Erro ao adicionar item:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao adicionar item.\\n\\n${error.message}`
    });
  } finally {
    client.release();
  }
}'''

# Substituir
conteudo = conteudo[:inicio] + nova_funcao_desc + conteudo[fim:]
print("✓ Funções de adicionar item modificadas (2 etapas)")

# Salvar
with open(arquivo, 'w', encoding='utf-8') as f:
    f.write(conteudo)

print("✅ Modificação aplicada!")
