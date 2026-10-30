// ============================================================
// web-app/public/js/orcamentos.js — V.2610301210
// FRONTEND DO SISTEMA DE ORÇAMENTOS
//
// 🎯 Consome API /api/orcamentos
// 🎯 Interface estilo chat (igual WhatsApp)
// ============================================================

// Estado da aplicação
let estadoAtual = {
    etapa: 'MENU',
    orcamento: null,
    embarcacoes: [],
    opcoes: []
};

// Token de autenticação
let authToken = null;

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Obter token do localStorage
    authToken = localStorage.getItem('token');

    if (!authToken) {
        window.location.href = '/login.html';
        return;
    }

    // Configurar eventos
    document.getElementById('btnEnviar').addEventListener('click', enviarComando);
    document.getElementById('comandoInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') enviarComando();
    });
    document.getElementById('btnVoltar').addEventListener('click', () => {
        window.location.href = '/';
    });

    // Carregar nome do usuário
    carregarUsuario();

    // Mostrar menu principal
    carregarMenuPrincipal();
});

// ============================================================
// AUTENTICAÇÃO E USUÁRIO
// ============================================================

async function carregarUsuario() {
    try {
        const response = await fetch('/api/usuarios/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('usuarioNome').textContent = data.usuario.nome;
        }
    } catch (error) {
        console.error('Erro ao carregar usuário:', error);
    }
}

// ============================================================
// API - HELPERS
// ============================================================

async function apiGet(endpoint) {
    const response = await fetch(`/api/orcamentos${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Erro na requisição');
    }

    return await response.json();
}

async function apiPost(endpoint, dados) {
    const response = await fetch(`/api/orcamentos${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(dados)
    });

    if (!response.ok) {
        throw new Error('Erro na requisição');
    }

    return await response.json();
}

// ============================================================
// UI - MENSAGENS
// ============================================================

function adicionarMensagem(tipo, texto, timestamp = true) {
    const container = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');

    const mensagemDiv = document.createElement('div');
    mensagemDiv.className = `mensagem mensagem-${tipo}`;

    const conteudoDiv = document.createElement('div');
    conteudoDiv.className = 'mensagem-conteudo';
    conteudoDiv.textContent = texto;

    if (timestamp) {
        const time = new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'timestamp';
        timestampDiv.textContent = time;
        conteudoDiv.appendChild(timestampDiv);
    }

    mensagemDiv.appendChild(conteudoDiv);
    container.insertBefore(mensagemDiv, typingIndicator);
    container.scrollTop = container.scrollHeight;
}

function adicionarOpcoes(opcoes) {
    const container = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');

    const opcoesDiv = document.createElement('div');
    opcoesDiv.className = 'opcoes-container';

    opcoes.forEach(opcao => {
        const btn = document.createElement('button');
        btn.className = 'btn-opcao';

        const emoji = document.createElement('span');
        emoji.className = 'emoji';
        emoji.textContent = opcao.emoji;

        const texto = document.createElement('span');
        texto.className = 'texto';
        texto.innerHTML = `<strong>${opcao.num}</strong> - ${opcao.texto}`;

        btn.appendChild(emoji);
        btn.appendChild(texto);
        btn.onclick = () => enviarComando(opcao.num);

        opcoesDiv.appendChild(btn);
    });

    container.insertBefore(opcoesDiv, typingIndicator);
    container.scrollTop = container.scrollHeight;
}

function mostrarDigitando() {
    document.getElementById('typingIndicator').classList.add('show');
    document.getElementById('chatMessages').scrollTop =
        document.getElementById('chatMessages').scrollHeight;
}

function esconderDigitando() {
    document.getElementById('typingIndicator').classList.remove('show');
}

function mostrarLoading(mostrar = true) {
    document.getElementById('loadingOverlay').style.display = mostrar ? 'flex' : 'none';
}

function limparInput() {
    document.getElementById('comandoInput').value = '';
}

// ============================================================
// FLUXO - MENU PRINCIPAL
// ============================================================

async function carregarMenuPrincipal() {
    try {
        mostrarDigitando();
        await new Promise(resolve => setTimeout(resolve, 500));

        const data = await apiGet('/menu');

        esconderDigitando();
        adicionarMensagem('sistema', data.menu.mensagem);
        adicionarOpcoes(data.menu.opcoes);

        estadoAtual.etapa = 'MENU';
        estadoAtual.opcoes = data.menu.opcoes;
    } catch (error) {
        esconderDigitando();
        adicionarMensagem('sistema', '❌ Erro ao carregar menu. Tente novamente.');
        console.error('Erro ao carregar menu:', error);
    }
}

// ============================================================
// FLUXO - CRIAR ORÇAMENTO
// ============================================================

async function iniciarCriacaoOrcamento() {
    try {
        mostrarDigitando();
        await new Promise(resolve => setTimeout(resolve, 500));

        const data = await apiGet('/embarcacoes');

        esconderDigitando();
        adicionarMensagem('sistema', data.menu.mensagem);
        adicionarOpcoes(data.menu.opcoes);

        estadoAtual.etapa = 'SELECIONAR_EMBARCACAO';
        estadoAtual.embarcacoes = data.embarcacoes;
        estadoAtual.opcoes = data.menu.opcoes;
    } catch (error) {
        esconderDigitando();
        adicionarMensagem('sistema', '❌ Erro ao carregar embarcações. Tente novamente.');
        console.error('Erro ao carregar embarcações:', error);
    }
}

async function selecionarEmbarcacao(numero) {
    const opcao = estadoAtual.opcoes.find(o => o.num === numero);

    if (!opcao || !opcao.embarcacao) {
        adicionarMensagem('sistema', '❌ Opção inválida! Digite o número da embarcação.');
        return;
    }

    const embarcacao = opcao.embarcacao;

    // Inicializar orçamento
    estadoAtual.orcamento = {
        embarcacao: embarcacao,
        titulo: null,
        itens: []
    };

    estadoAtual.etapa = 'TITULO';

    mostrarDigitando();
    await new Promise(resolve => setTimeout(resolve, 300));
    esconderDigitando();

    const mensagem = `✅ Embarcação selecionada: ${embarcacao.numero_pb} (${embarcacao.nome})

━━━━━━━━━━━━━━━━
📝 *PASSO 2/5: TÍTULO DO ORÇAMENTO*
━━━━━━━━━━━━━━━━
Digite o título do orçamento:

💡 Exemplo: Manutenção preventiva do motor

0️⃣ Cancelar`;

    adicionarMensagem('sistema', mensagem);
}

async function receberTitulo(titulo) {
    try {
        // Validar título
        const validacao = await apiPost('/validar-titulo', { titulo });

        if (!validacao.valido) {
            adicionarMensagem('sistema', validacao.mensagem);
            return;
        }

        // Salvar título
        estadoAtual.orcamento.titulo = titulo.toUpperCase();
        estadoAtual.etapa = 'ITEM_DESCRICAO';

        mostrarDigitando();
        await new Promise(resolve => setTimeout(resolve, 300));
        esconderDigitando();

        const numeroItem = estadoAtual.orcamento.itens.length + 1;
        const mensagem = `✅ Embarcação: ${estadoAtual.orcamento.embarcacao.numero_pb}
✅ Título: ${estadoAtual.orcamento.titulo}

━━━━━━━━━━━━━━━━
📦 *PASSO 3/5: ITENS DO ORÇAMENTO*
━━━━━━━━━━━━━━━━
*Item #${numeroItem}* - Digite a descrição:

💡 Exemplo: Troca de óleo do motor

1️⃣ Pular cadastro de item
0️⃣ Voltar ao título`;

        adicionarMensagem('sistema', mensagem);
    } catch (error) {
        adicionarMensagem('sistema', '❌ Erro ao validar título. Tente novamente.');
        console.error('Erro ao validar título:', error);
    }
}

async function receberDescricaoItem(descricao) {
    // Pular cadastro de itens
    if (descricao === '1') {
        await mostrarResumo();
        return;
    }

    try {
        // Validar descrição
        const validacao = await apiPost('/validar-descricao', { descricao });

        if (!validacao.valido) {
            adicionarMensagem('sistema', validacao.mensagem);
            return;
        }

        // Salvar descrição temporária
        estadoAtual.itemAtual = { descricao };
        estadoAtual.etapa = 'ITEM_VALOR';

        mostrarDigitando();
        await new Promise(resolve => setTimeout(resolve, 300));
        esconderDigitando();

        const numeroItem = estadoAtual.orcamento.itens.length + 1;
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

        adicionarMensagem('sistema', mensagem);
    } catch (error) {
        adicionarMensagem('sistema', '❌ Erro ao validar descrição. Tente novamente.');
        console.error('Erro ao validar descrição:', error);
    }
}

async function receberValorItem(valorTexto) {
    try {
        // Validar valor
        const validacao = await apiPost('/validar-valor', { valor: valorTexto });

        if (!validacao.valido) {
            adicionarMensagem('sistema', validacao.mensagem);
            return;
        }

        // Adicionar item à lista
        const numeroItem = estadoAtual.orcamento.itens.length + 1;
        estadoAtual.orcamento.itens.push({
            ordem: numeroItem,
            descricao: estadoAtual.itemAtual.descricao,
            valor: validacao.valor || 0
        });

        estadoAtual.etapa = 'ITEM_MENU';

        mostrarDigitando();
        await new Promise(resolve => setTimeout(resolve, 300));
        esconderDigitando();

        const valorFormatado = validacao.valor
            ? validacao.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : '(não informado)';

        const mensagem = `✅ *Item #${numeroItem} adicionado:*

📦 ${estadoAtual.itemAtual.descricao}
💰 ${valorFormatado}

━━━━━━━━━━━━━━━━
O que deseja fazer?

1️⃣ ➕ Adicionar outro item
2️⃣ ✅ Finalizar itens

0️⃣ Cancelar orçamento`;

        adicionarMensagem('sistema', mensagem);

        // Criar opções de menu
        const opcoes = [
            { num: '1', emoji: '➕', texto: 'Adicionar outro item' },
            { num: '2', emoji: '✅', texto: 'Finalizar itens' },
            { num: '0', emoji: '🚫', texto: 'Cancelar orçamento' }
        ];

        adicionarOpcoes(opcoes);
        estadoAtual.opcoes = opcoes;

    } catch (error) {
        adicionarMensagem('sistema', '❌ Erro ao validar valor. Tente novamente.');
        console.error('Erro ao validar valor:', error);
    }
}

async function processarMenuItens(opcao) {
    if (opcao === '1') {
        // Adicionar outro item
        estadoAtual.etapa = 'ITEM_DESCRICAO';
        estadoAtual.itemAtual = {};

        mostrarDigitando();
        await new Promise(resolve => setTimeout(resolve, 300));
        esconderDigitando();

        const numeroItem = estadoAtual.orcamento.itens.length + 1;
        const mensagem = `✅ Embarcação: ${estadoAtual.orcamento.embarcacao.numero_pb}
✅ Título: ${estadoAtual.orcamento.titulo}

━━━━━━━━━━━━━━━━
📦 *PASSO 3/5: ITENS DO ORÇAMENTO*
━━━━━━━━━━━━━━━━
*Item #${numeroItem}* - Digite a descrição:

💡 Exemplo: Troca de óleo do motor

1️⃣ Pular cadastro de item
0️⃣ Voltar ao título`;

        adicionarMensagem('sistema', mensagem);
    } else if (opcao === '2') {
        // Finalizar itens
        await mostrarResumo();
    } else {
        adicionarMensagem('sistema', '❌ Opção inválida! Digite 1, 2 ou 0.');
    }
}

async function mostrarResumo() {
    estadoAtual.etapa = 'CONFIRMAR';

    mostrarDigitando();
    await new Promise(resolve => setTimeout(resolve, 500));
    esconderDigitando();

    // Calcular valores
    const subtotal = estadoAtual.orcamento.itens.reduce((sum, item) => sum + item.valor, 0);
    const taxaPerc = 20;
    const taxaValor = subtotal * (taxaPerc / 100);
    const total = subtotal + taxaValor;

    const formatarMoeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let mensagem = `📋 *RESUMO DO ORÇAMENTO*

🚤 Embarcação: ${estadoAtual.orcamento.embarcacao.numero_pb} (${estadoAtual.orcamento.embarcacao.nome})
📌 Título: ${estadoAtual.orcamento.titulo}

━━━━━━━━━━━━━━━━
📦 *ITENS:*

`;

    estadoAtual.orcamento.itens.forEach(item => {
        mensagem += `${item.ordem}. ${item.descricao.substring(0, 25).padEnd(25)} ${formatarMoeda(item.valor)}\n`;
    });

    mensagem += `
━━━━━━━━━━━━━━━━
💰 *VALORES:*

Subtotal (itens).............. ${formatarMoeda(subtotal)}
Taxa de Gestão (${taxaPerc}%).......... ${formatarMoeda(taxaValor)}
━━━━━━━━━━━━━━━━
*TOTAL......................... ${formatarMoeda(total)}*

━━━━━━━━━━━━━━━━
1️⃣ ✅ Confirmar e criar orçamento
2️⃣ 🗑️ Cancelar tudo

Escolha uma opção:`;

    adicionarMensagem('sistema', mensagem);

    const opcoes = [
        { num: '1', emoji: '✅', texto: 'Confirmar e criar orçamento' },
        { num: '2', emoji: '🗑️', texto: 'Cancelar tudo' }
    ];

    adicionarOpcoes(opcoes);
    estadoAtual.opcoes = opcoes;
}

async function confirmarOrcamento() {
    try {
        mostrarLoading(true);

        const dados = {
            embarcacao: estadoAtual.orcamento.embarcacao,
            titulo: estadoAtual.orcamento.titulo,
            itens: estadoAtual.orcamento.itens
        };

        const resultado = await apiPost('/criar', dados);

        mostrarLoading(false);

        const formatarMoeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const mensagem = `✅ *ORÇAMENTO CRIADO COM SUCESSO!*

🆔 Número: #${resultado.id_orcamento}
🚤 Embarcação: ${estadoAtual.orcamento.embarcacao.numero_pb}
💰 Valor Total: ${formatarMoeda(resultado.valores.valor_total)}

━━━━━━━━━━━━━━━━
O orçamento foi salvo com sucesso!

1️⃣ Criar outro orçamento
0️⃣ Voltar ao menu principal`;

        adicionarMensagem('sistema', mensagem);

        const opcoes = [
            { num: '1', emoji: '➕', texto: 'Criar outro orçamento' },
            { num: '0', emoji: '🔙', texto: 'Voltar ao menu principal' }
        ];

        adicionarOpcoes(opcoes);
        estadoAtual.opcoes = opcoes;
        estadoAtual.etapa = 'ORCAMENTO_CRIADO';

    } catch (error) {
        mostrarLoading(false);
        adicionarMensagem('sistema', '❌ Erro ao criar orçamento. Tente novamente.');
        console.error('Erro ao criar orçamento:', error);
    }
}

// ============================================================
// PROCESSAMENTO DE COMANDOS
// ============================================================

async function enviarComando(comandoParam) {
    let comando;

    if (typeof comandoParam === 'string') {
        comando = comandoParam;
    } else {
        comando = document.getElementById('comandoInput').value.trim();
    }

    if (!comando) return;

    // Adicionar mensagem do usuário
    adicionarMensagem('usuario', comando);
    limparInput();

    // Processar comando baseado na etapa
    try {
        if (comando === '0') {
            // Voltar ao menu
            await carregarMenuPrincipal();
            return;
        }

        switch (estadoAtual.etapa) {
            case 'MENU':
                await processarMenuPrincipal(comando);
                break;

            case 'SELECIONAR_EMBARCACAO':
                await selecionarEmbarcacao(comando);
                break;

            case 'TITULO':
                await receberTitulo(comando);
                break;

            case 'ITEM_DESCRICAO':
                await receberDescricaoItem(comando);
                break;

            case 'ITEM_VALOR':
                await receberValorItem(comando);
                break;

            case 'ITEM_MENU':
                await processarMenuItens(comando);
                break;

            case 'CONFIRMAR':
                if (comando === '1') {
                    await confirmarOrcamento();
                } else if (comando === '2') {
                    await carregarMenuPrincipal();
                }
                break;

            case 'ORCAMENTO_CRIADO':
                if (comando === '1') {
                    await iniciarCriacaoOrcamento();
                } else if (comando === '0') {
                    await carregarMenuPrincipal();
                }
                break;

            default:
                adicionarMensagem('sistema', '❌ Estado desconhecido. Voltando ao menu...');
                await carregarMenuPrincipal();
        }
    } catch (error) {
        console.error('Erro ao processar comando:', error);
        adicionarMensagem('sistema', '❌ Erro ao processar comando. Tente novamente.');
    }
}

async function processarMenuPrincipal(comando) {
    switch (comando) {
        case '1': // Criar Novo Orçamento
            await iniciarCriacaoOrcamento();
            break;

        case '2': // Consultar Rascunhos
            adicionarMensagem('sistema', '🚧 Funcionalidade em desenvolvimento...');
            break;

        case '3': // Consultar Fechados
            adicionarMensagem('sistema', '🚧 Funcionalidade em desenvolvimento...');
            break;

        case '4': // Por Embarcação
            adicionarMensagem('sistema', '🚧 Funcionalidade em desenvolvimento...');
            break;

        case '5': // Pendentes Aprovação
            adicionarMensagem('sistema', '🚧 Funcionalidade em desenvolvimento...');
            break;

        case '6': // Pendentes Cobrança
            adicionarMensagem('sistema', '🚧 Funcionalidade em desenvolvimento...');
            break;

        default:
            adicionarMensagem('sistema', '❌ Opção inválida! Digite um número de 0 a 6.');
    }
}

// V.2610301210
