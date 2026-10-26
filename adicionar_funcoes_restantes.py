#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Adicionar funções e handlers restantes
"""

arquivo = 'wpp/comandos/orcamentos.js'

# Ler arquivo
with open(arquivo, 'r', encoding='utf-8') as f:
    conteudo = f.read()

print("📝 Adicionando funções restantes...")

# Encontrar onde adicionar as novas funções (antes de verDetalhesOrcamento)
pos = conteudo.find('async function verDetalhesOrcamento')

if pos == -1:
    print("❌ Função verDetalhesOrcamento não encontrada!")
    exit(1)

# Novas funções para adicionar
novas_funcoes = '''
async function mostrarHistoricoLog(sock, userId, groupId, idOrcamento) {
  try {
    const logs = await buscarLogs(idOrcamento);

    const mensagem = `━━━━━━━━━━━━━━━━
📋 *HISTÓRICO (LOG)*
━━━━━━━━━━━━━━━━
${logs}
━━━━━━━━━━━━━━━━
Digite *menu* para voltar.`;

    await sock.sendMessage(groupId, { text: mensagem });
  } catch (error) {
    console.error('❌ [LOG] Erro ao mostrar histórico:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao buscar histórico.\\n\\n${error.message}`
    });
  }
}

async function mostrarMenuEditar(sock, userId, groupId, estado) {
  const mensagem = `━━━━━━━━━━━━━━━━
✏️ *MENU EDITAR*
━━━━━━━━━━━━━━━━
🆔 Orçamento: #${estado.orcamento.id}
🚤 ${estado.orcamento.numero_pb} - ${estado.orcamento.nome_embarcacao}
━━━━━━━━━━━━━━━━
*OPÇÕES:*
1️⃣ ➕ Adicionar Item
2️⃣ ✏️ Editar Item
3️⃣ 🗑️ Excluir Item
4️⃣ 📎 Incluir Arquivos
0️⃣ 🔙 Voltar
━━━━━━━━━━━━━━━━
Digite a opção:`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'MENU_EDITAR'
  });
}

'''

# Inserir antes de verDetalhesOrcamento
conteudo = conteudo[:pos] + novas_funcoes + conteudo[pos:]
print("✓ Funções mostrarHistoricoLog e mostrarMenuEditar adicionadas")

# Salvar
with open(arquivo, 'w', encoding='utf-8') as f:
    f.write(conteudo)

print("✅ Funções adicionadas com sucesso!")
