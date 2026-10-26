#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para aplicar mudanças no arquivo orcamentos.js
"""

import re

arquivo = 'wpp/comandos/orcamentos.js'

# Ler arquivo
with open(arquivo, 'r', encoding='utf-8') as f:
    conteudo = f.read()

print("📝 Aplicando mudanças...")

# 1. Remover linhas em branco antes de ━━━━━━━━━━━━━━━━
conteudo = re.sub(r'\n\n━━━━━━━━━━━━━━━━', r'\n━━━━━━━━━━━━━━━━', conteudo)
print("✓ Removidas linhas em branco antes de separadores")

# 2. Modificar verDetalhesOrcamento - remover LOG e adicionar submenu
# Encontrar a função
inicio = conteudo.find('async function verDetalhesOrcamento(sock, userId, groupId, idOrcamento) {')
if inicio == -1:
    print("❌ Função verDetalhesOrcamento não encontrada!")
    exit(1)

# Encontrar o final da função (próximo 'async function' ou fim do switch)
fim = conteudo.find('\n\nasync function', inicio + 100)
if fim == -1:
    fim = len(conteudo)

# Extrair a função
funcao_antiga = conteudo[inicio:fim]

# Nova versão da função (sem LOG, com submenu)
nova_funcao = '''async function verDetalhesOrcamento(sock, userId, groupId, idOrcamento, mostrarSubmenu = true) {
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
      mensagem += '(nenhum item cadastrado)\\n';
    } else {
      itensResult.rows.forEach(item => {
        mensagem += `${item.ordem}. ${item.descricao} - ${formatarMoeda(item.valor_total)}\\n`;
      });
    }

    mensagem += `━━━━━━━━━━━━━━━━
💰 *VALORES:*
Subtotal: ${formatarMoeda(orc.subtotal)}
Taxa gestão (${orc.taxa_servico_perc}%): ${formatarMoeda(orc.taxa_servico_valor)}
*TOTAL: ${formatarMoeda(orc.valor_total)}*`;

    if (mostrarSubmenu) {
      mensagem += `\\n━━━━━━━━━━━━━━━━
*OPÇÕES:*
1️⃣ ✏️ Editar
2️⃣ 📋 Acessar HISTÓRICO (LOG)
3️⃣ ✅ Aprovar orçamento
4️⃣ 💵 Enviar cobrança
0️⃣ 🔙 Voltar
━━━━━━━━━━━━━━━━
Digite a opção:`;

      // Salvar no estado
      atualizarEstado(userId, {
        etapa: 'DETALHES_ORCAMENTO',
        orcamento: {
          id: orc.id_orcamento,
          numero: orc.numero,
          titulo: orc.titulo,
          status: orc.status,
          numero_pb: orc.numero_pb,
          nome_embarcacao: orc.nome_embarcacao
        },
        itens: itensResult.rows
      });
    } else {
      mensagem += `\\n━━━━━━━━━━━━━━━━
Digite *menu* para voltar.`;
    }

    await sock.sendMessage(groupId, { text: mensagem });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao buscar detalhes:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar detalhes.\\n\\n${error.message}`
    });
  }
}'''

# Substituir
conteudo = conteudo[:inicio] + nova_funcao + conteudo[fim:]
print("✓ Função verDetalhesOrcamento atualizada (sem LOG, com submenu)")

# Salvar
with open(arquivo, 'w', encoding='utf-8') as f:
    f.write(conteudo)

print("✅ Mudanças aplicadas com sucesso!")
print(f"   Arquivo: {arquivo}")
