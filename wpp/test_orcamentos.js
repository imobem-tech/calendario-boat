// ============================================================
// test_orcamentos.js — V.2610241109
// TESTE DEV: Sistema de orçamentos
// Simula fluxo completo sem afetar produção
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

import { mostrarMenuOrcamentos, processarMensagemOrcamentos } from './comandos/orcamentos.js';

// ============================================================
// MOCK DO SOCK (simulação do WhatsApp)
// ============================================================
const mensagensEnviadas = [];

const mockSock = {
  sendMessage: async (groupId, content) => {
    const texto = content.text || JSON.stringify(content);
    console.log('\n' + '='.repeat(70));
    console.log('📤 MENSAGEM ENVIADA PARA:', groupId);
    console.log('='.repeat(70));
    console.log(texto);
    console.log('='.repeat(70) + '\n');

    mensagensEnviadas.push({
      para: groupId,
      conteudo: texto,
      timestamp: new Date()
    });
  }
};

// ============================================================
// CONFIGURAÇÃO DO TESTE
// ============================================================
const GRUPO_TEST = '120363412373130577@g.us'; // Grupo ORÇAMENTOS
const USER_TEST = '5511999999999@s.whatsapp.net'; // Usuário teste

// ============================================================
// SIMULADOR INTERATIVO
// ============================================================
async function simularFluxo() {
  console.log('\n🧪 ========================================');
  console.log('   TESTE DEV - SISTEMA DE ORÇAMENTOS');
  console.log('========================================\n');

  console.log('📋 Fluxo que será testado:');
  console.log('1. Abrir menu (comando "menu")');
  console.log('2. Criar novo orçamento (opção 1)');
  console.log('3. Selecionar embarcação');
  console.log('4. Digitar título');
  console.log('5. Adicionar item #1');
  console.log('6. Adicionar item #2');
  console.log('7. Finalizar e confirmar\n');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const pergunta = (texto) => {
    return new Promise((resolve) => {
      rl.question(texto, resolve);
    });
  };

  try {
    // PASSO 1: Abrir menu
    console.log('\n🔹 PASSO 1: Abrindo menu...');
    await mostrarMenuOrcamentos(mockSock, USER_TEST, GRUPO_TEST);

    let continuar = await pergunta('\n▶️ Continuar? (s/n): ');
    if (continuar.toLowerCase() !== 's') {
      console.log('❌ Teste cancelado.');
      rl.close();
      return;
    }

    // PASSO 2: Criar novo orçamento (opção 1)
    console.log('\n🔹 PASSO 2: Selecionando "Criar Novo Orçamento"...');
    await processarMensagemOrcamentos(mockSock, USER_TEST, GRUPO_TEST, '1');

    continuar = await pergunta('\n▶️ Continuar? (s/n): ');
    if (continuar.toLowerCase() !== 's') {
      console.log('❌ Teste cancelado.');
      rl.close();
      return;
    }

    // PASSO 3: Selecionar embarcação (primeira da lista)
    console.log('\n🔹 PASSO 3: Selecionando embarcação...');
    const embarcacao = await pergunta('Digite o número da embarcação (ou ENTER para usar 1): ');
    await processarMensagemOrcamentos(mockSock, USER_TEST, GRUPO_TEST, embarcacao || '1');

    continuar = await pergunta('\n▶️ Continuar? (s/n): ');
    if (continuar.toLowerCase() !== 's') {
      console.log('❌ Teste cancelado.');
      rl.close();
      return;
    }

    // PASSO 4: Digitar título
    console.log('\n🔹 PASSO 4: Digitando título do orçamento...');
    const titulo = await pergunta('Digite o título (ou ENTER para usar "Manutenção preventiva do motor"): ');
    await processarMensagemOrcamentos(
      mockSock,
      USER_TEST,
      GRUPO_TEST,
      titulo || 'Manutenção preventiva do motor'
    );

    continuar = await pergunta('\n▶️ Continuar? (s/n): ');
    if (continuar.toLowerCase() !== 's') {
      console.log('❌ Teste cancelado.');
      rl.close();
      return;
    }

    // PASSO 5: Adicionar item #1
    console.log('\n🔹 PASSO 5: Adicionando item #1...');
    const item1Desc = await pergunta('Descrição do item 1 (ou ENTER para "Troca de óleo do motor"): ');
    await processarMensagemOrcamentos(
      mockSock,
      USER_TEST,
      GRUPO_TEST,
      item1Desc || 'Troca de óleo do motor'
    );

    const item1Valor = await pergunta('Valor do item 1 (ou ENTER para "500"): ');
    await processarMensagemOrcamentos(
      mockSock,
      USER_TEST,
      GRUPO_TEST,
      item1Valor || '500'
    );

    continuar = await pergunta('\n▶️ Adicionar mais um item? (s/n): ');

    if (continuar.toLowerCase() === 's') {
      // Escolher opção 1 (adicionar outro item)
      await processarMensagemOrcamentos(mockSock, USER_TEST, GRUPO_TEST, '1');

      // PASSO 6: Adicionar item #2
      console.log('\n🔹 PASSO 6: Adicionando item #2...');
      const item2Desc = await pergunta('Descrição do item 2 (ou ENTER para "Filtro de combustível"): ');
      await processarMensagemOrcamentos(
        mockSock,
        USER_TEST,
        GRUPO_TEST,
        item2Desc || 'Filtro de combustível'
      );

      const item2Valor = await pergunta('Valor do item 2 (ou ENTER para "150,50"): ');
      await processarMensagemOrcamentos(
        mockSock,
        USER_TEST,
        GRUPO_TEST,
        item2Valor || '150,50'
      );
    }

    // PASSO 7: Finalizar itens (opção 3)
    console.log('\n🔹 PASSO 7: Finalizando itens...');
    await processarMensagemOrcamentos(mockSock, USER_TEST, GRUPO_TEST, '3');

    continuar = await pergunta('\n▶️ Confirmar criação do orçamento? (s/n): ');

    if (continuar.toLowerCase() === 's') {
      console.log('\n🔹 PASSO 8: Confirmando criação...');
      await processarMensagemOrcamentos(mockSock, USER_TEST, GRUPO_TEST, '1');

      console.log('\n✅ ========================================');
      console.log('   TESTE CONCLUÍDO COM SUCESSO!');
      console.log('========================================\n');

      console.log('📊 Total de mensagens enviadas:', mensagensEnviadas.length);

      const salvarLog = await pergunta('\n💾 Salvar log completo? (s/n): ');
      if (salvarLog.toLowerCase() === 's') {
        const fs = require('fs');
        const logPath = './test_orcamentos_log.txt';
        const logContent = mensagensEnviadas.map((msg, i) => {
          return `\n${'='.repeat(70)}\nMENSAGEM ${i + 1} - ${msg.timestamp.toLocaleString('pt-BR')}\n${'='.repeat(70)}\n${msg.conteudo}\n`;
        }).join('\n');

        fs.writeFileSync(logPath, logContent);
        console.log(`✅ Log salvo em: ${logPath}`);
      }
    } else {
      console.log('\n❌ Criação cancelada.');
    }

  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error(error.stack);
  } finally {
    rl.close();
  }
}

// ============================================================
// TESTE AUTOMATIZADO (sem interação)
// ============================================================
async function testeAutomatizado() {
  console.log('\n🤖 ========================================');
  console.log('   TESTE AUTOMATIZADO');
  console.log('========================================\n');

  try {
    const passos = [
      { descricao: 'Abrir menu', comando: 'menu', funcao: mostrarMenuOrcamentos },
      { descricao: 'Criar novo orçamento', mensagem: '1' },
      { descricao: 'Selecionar embarcação 1', mensagem: '1' },
      { descricao: 'Título do orçamento', mensagem: 'Manutenção preventiva do motor' },
      { descricao: 'Item 1 - Descrição', mensagem: 'Troca de óleo do motor' },
      { descricao: 'Item 1 - Valor', mensagem: '500' },
      { descricao: 'Adicionar outro item', mensagem: '1' },
      { descricao: 'Item 2 - Descrição', mensagem: 'Filtro de combustível' },
      { descricao: 'Item 2 - Valor', mensagem: '150,50' },
      { descricao: 'Finalizar itens', mensagem: '3' },
      { descricao: 'Confirmar criação', mensagem: '1' }
    ];

    for (const [index, passo] of passos.entries()) {
      console.log(`\n🔹 PASSO ${index + 1}/${passos.length}: ${passo.descricao}`);

      if (passo.funcao) {
        await passo.funcao(mockSock, USER_TEST, GRUPO_TEST);
      } else {
        await processarMensagemOrcamentos(mockSock, USER_TEST, GRUPO_TEST, passo.mensagem);
      }

      // Delay para simular digitação humana
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n✅ ========================================');
    console.log('   TESTE AUTOMATIZADO CONCLUÍDO!');
    console.log('========================================\n');
    console.log('📊 Total de mensagens:', mensagensEnviadas.length);

  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error(error.stack);
  }
}

// ============================================================
// EXECUTAR
// ============================================================
const args = process.argv.slice(2);

if (args[0] === 'auto') {
  testeAutomatizado();
} else {
  simularFluxo();
}

// V.2610241109
