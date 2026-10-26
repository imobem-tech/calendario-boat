#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Adicionar handlers para novos estados
"""

arquivo = 'wpp/comandos/orcamentos.js'

# Ler arquivo
with open(arquivo, 'r', encoding='utf-8') as f:
    conteudo = f.read()

print("📝 Adicionando handlers...")

# Encontrar onde adicionar (antes do default do switch)
pos = conteudo.find('    default:\n      await mostrarMenuOrcamentos(sock, userId, groupId);')

if pos == -1:
    print("❌ Switch default não encontrado!")
    exit(1)

# Novos handlers
novos_handlers = '''
    case 'DETALHES_ORCAMENTO':
      switch (texto) {
        case '0':
          await mostrarMenuOrcamentos(sock, userId, groupId);
          break;
        case '1':
          await mostrarMenuEditar(sock, userId, groupId, estado);
          break;
        case '2':
          await mostrarHistoricoLog(sock, userId, groupId, estado.orcamento.id);
          break;
        case '3':
          await sock.sendMessage(groupId, { text: '🚧 *Aprovar Orçamento*\\n\\nEm desenvolvimento...\\n\\nDigite *menu* para voltar.' });
          break;
        case '4':
          await sock.sendMessage(groupId, { text: '🚧 *Enviar Cobrança*\\n\\nEm desenvolvimento...\\n\\nDigite *menu* para voltar.' });
          break;
        default:
          await sock.sendMessage(groupId, { text: '❌ Opção inválida! Digite 1, 2, 3, 4 ou 0.' });
      }
      break;

    case 'MENU_EDITAR':
      switch (texto) {
        case '0':
          await verDetalhesOrcamento(sock, userId, groupId, estado.orcamento.id);
          break;
        case '1':
          await pedirDescricaoNovoItem(sock, userId, groupId, estado);
          break;
        case '2':
          if (estado.itens.length === 0) {
            await sock.sendMessage(groupId, { text: '❌ Não há itens para editar!' });
            return;
          }
          await selecionarItemParaEditar(sock, userId, groupId, estado);
          break;
        case '3':
          if (estado.itens.length === 0) {
            await sock.sendMessage(groupId, { text: '❌ Não há itens para excluir!' });
            return;
          }
          await selecionarItemParaExcluir(sock, userId, groupId, estado);
          break;
        case '4':
          await sock.sendMessage(groupId, { text: '🚧 *Incluir Arquivos*\\n\\nEm desenvolvimento...\\n\\nDigite *menu* para voltar.' });
          break;
        default:
          await sock.sendMessage(groupId, { text: '❌ Opção inválida! Digite 1, 2, 3, 4 ou 0.' });
      }
      break;

    case 'ADICIONAR_ITEM_DESCRICAO':
      if (texto === '0') {
        await mostrarMenuEditar(sock, userId, groupId, estado);
        return;
      }
      await receberDescricaoNovoItem(sock, userId, groupId, estado, texto);
      break;

    case 'ADICIONAR_ITEM_VALOR':
      if (texto === '0') {
        await mostrarMenuEditar(sock, userId, groupId, estado);
        return;
      }
      await receberValorNovoItem(sock, userId, groupId, estado, texto);
      break;

'''

# Inserir antes do default
conteudo = conteudo[:pos] + novos_handlers + conteudo[pos:]
print("✓ Handlers adicionados para DETALHES_ORCAMENTO, MENU_EDITAR, ADICIONAR_ITEM_*")

# Remover handlers antigos de gerenciamento se existirem
conteudo = conteudo.replace("case 'GERENCIAR_PEDIR_NUMERO':", "/* case 'GERENCIAR_PEDIR_NUMERO': (removido)")
conteudo = conteudo.replace("case 'GERENCIAR_MENU':", "/* case 'GERENCIAR_MENU': (removido)")
conteudo = conteudo.replace("case 'GERENCIAR_ADICIONANDO':", "/* case 'GERENCIAR_ADICIONANDO': (removido)")

# Salvar
with open(arquivo, 'w', encoding='utf-8') as f:
    f.write(conteudo)

print("✅ Handlers adicionados com sucesso!")
