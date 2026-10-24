# 💼 SISTEMA DE ORÇAMENTOS VIA WHATSAPP

**Versão:** V.2610241528  
**Data:** 24/10/2026  
**Arquivo:** `wpp/comandos/orcamentos.js`

---

## 📋 ÍNDICE

1. [Visão Geral](#visão-geral)
2. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
3. [Menu Principal](#menu-principal)
4. [Criar Novo Orçamento](#criar-novo-orçamento)
5. [Consultar Orçamentos](#consultar-orçamentos)
6. [Detalhes do Orçamento](#detalhes-do-orçamento)
7. [Editar Itens](#editar-itens)
8. [Sistema de LOG e Histórico](#sistema-de-log-e-histórico)
9. [Observações Privadas](#observações-privadas)
10. [Sistema de Anexos](#sistema-de-anexos)
11. [Validações e Regras](#validações-e-regras)

---

## 🎯 VISÃO GERAL

Sistema completo de gestão de orçamentos via WhatsApp, integrado ao bot Marujo⚓, com funcionalidades de:

- ✅ Criação de orçamentos com múltiplos itens
- ✅ Edição completa (adicionar, editar, excluir itens)
- ✅ Consulta por status, embarcação e período
- ✅ Sistema de LOG completo para auditoria
- ✅ Validações de formato e status
- ✅ Cálculo automático de valores e taxa de gestão

**Grupo WhatsApp:** `120363412373130577@g.us` (Grupo ORÇAMENTOS)

---

## 🗄️ ESTRUTURA DO BANCO DE DADOS

### **Tabelas Principais:**

#### 1. `orcamento_servico` (Cabeçalho)
```sql
CREATE TABLE orcamento_servico (
  id_orcamento SERIAL PRIMARY KEY,
  numero VARCHAR(50),              -- ORC-YYMMDDHHMMSS
  id_empresa INTEGER,
  id_embarcacao INTEGER,           -- FK → P_BOAT_1_Embarcacao.Código
  descricao TEXT,                  -- Título do orçamento
  valor_servicos DECIMAL(10,2),    -- Subtotal dos itens
  taxa_servico_perc DECIMAL(5,2),  -- % da taxa (padrão 20%)
  taxa_servico_valor DECIMAL(10,2),-- Valor da taxa
  valor_total DECIMAL(10,2),       -- Total final
  status VARCHAR(20),              -- RASCUNHO, ENVIADO, APROVADO, etc.
  id_grupo INTEGER,
  data_cadastro TIMESTAMP,
  data_orcamento TIMESTAMP
);
```

#### 2. `orcamento_item` (Itens do Orçamento)
```sql
CREATE TABLE orcamento_item (
  id_item SERIAL PRIMARY KEY,
  id_orcamento INTEGER,            -- FK → orcamento_servico
  ordem INTEGER,                   -- Ordem de exibição
  descricao VARCHAR(255),
  quantidade DECIMAL(10,3),
  valor_unitario DECIMAL(10,2),
  valor_total DECIMAL(10,2)
);
```

#### 3. `orcamento_log` (Histórico de Ações)
```sql
CREATE TABLE orcamento_log (
  id_log SERIAL PRIMARY KEY,
  id_orcamento INTEGER,            -- FK → orcamento_servico
  acao VARCHAR(50),                -- CRIOU, ITEM_ADICIONADO, etc.
  descricao TEXT,
  data_hora TIMESTAMP,
  ip_origem VARCHAR(50)            -- Telefone do usuário
);
```

---

## 📱 MENU PRINCIPAL

Acesso via WhatsApp: Digite **"menu"** → Escolha opção de orçamentos

```
━━━━━━━━━━━━━━━━
💼 SISTEMA DE ORÇAMENTOS
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
Digite o número da opção:
```

---

## ➕ CRIAR NOVO ORÇAMENTO

### **Fluxo Completo:**

#### **PASSO 1: Selecionar Embarcação**
```
🚤 SELECIONAR EMBARCAÇÃO
━━━━━━━━━━━━━━━━

Escolha a embarcação:

1️⃣ PB-001 - MAVERICK
2️⃣ PB-002 - GRACINHA II
3️⃣ PB-003 - SUMMER
4️⃣ PB-004 - DISCOVERY

0️⃣ Cancelar

━━━━━━━━━━━━━━━━
Digite o número:
```

**Critério:** Apenas embarcações ALLMAX (Cod_Cliente = 4255)

---

#### **PASSO 2: Título do Orçamento**
```
✅ Embarcação selecionada: PB-002 (GRACINHA II)

━━━━━━━━━━━━━━━━
📝 PASSO 2/5: TÍTULO DO ORÇAMENTO
━━━━━━━━━━━━━━━━

Digite o título do orçamento:

💡 Exemplo: Manutenção preventiva do motor

0️⃣ Cancelar
```

**Validação:** Mínimo 2 palavras de 3+ caracteres cada

---

#### **PASSO 3: Adicionar Itens**

**3.1 - Descrição do Item:**
```
📦 PASSO 3/5: ITENS DO ORÇAMENTO
━━━━━━━━━━━━━━━━

Item #1 - Digite a descrição:

💡 Exemplo: Troca de óleo do motor

0️⃣ Cancelar orçamento
```

**Validação:** Mínimo 2 palavras de 3+ caracteres cada

**3.2 - Valor do Item:**
```
✅ Item #1: Troca de óleo do motor

━━━━━━━━━━━━━━━━
💰 VALOR DO ITEM
━━━━━━━━━━━━━━━━

Digite o valor (R$) ou "pular":

💡 Formatos aceitos:
• 500
• 500,50
• 5.000,50
• 5000,5

⏭️ Digite "pular" para definir depois

0️⃣ Cancelar
```

**Validações:**
- Aceita vírgula para centavos
- Aceita ponto como separador de milhar
- Rejeita ponto sem vírgula (formato americano)

**3.3 - Menu após adicionar item:**
```
✅ Item #1 adicionado:

📦 Troca de óleo do motor
💰 R$ 500,00

━━━━━━━━━━━━━━━━

O que deseja fazer?

1️⃣ ➕ Adicionar outro item
2️⃣ ✏️ Ver/Editar itens
3️⃣ ✅ Finalizar itens

0️⃣ Cancelar orçamento
```

---

#### **PASSO 4: Resumo Final**
```
📋 RESUMO DO ORÇAMENTO

🚤 Embarcação: PB-002 (GRACINHA II)
📌 Título: Manutenção preventiva do motor

━━━━━━━━━━━━━━━━
📦 ITENS:

1. Troca de óleo do motor          R$ 500,00
2. Filtro de óleo                  R$ 150,00

━━━━━━━━━━━━━━━━
💰 VALORES:

Subtotal (itens).............. R$ 650,00
Taxa de Gestão (20%).......... R$ 130,00
━━━━━━━━━━━━━━━━
TOTAL......................... R$ 780,00

━━━━━━━━━━━━━━━━

1️⃣ ✅ Confirmar e criar orçamento
2️⃣ ✏️ Voltar para editar itens
3️⃣ 🗑️ Cancelar tudo

Escolha uma opção:
```

---

#### **PASSO 5: Confirmação**
```
✅ ORÇAMENTO CRIADO COM SUCESSO!

🆔 Número: #123
🚤 Embarcação: PB-002
💰 Valor Total: R$ 780,00

━━━━━━━━━━━━━━━━

O orçamento foi salvo e está disponível para consulta.

Digite menu para voltar ao menu principal.
```

**Sistema gera:**
- Número único: `ORC-YYMMDDHHMMSS`
- Status: `RASCUNHO`
- LOG: `Orçamento criado`

---

## 📋 CONSULTAR ORÇAMENTOS

### **2️⃣ Orçamentos Abertos**
Lista todos os orçamentos com status `RASCUNHO` ou `ENVIADO`

```
━━━━━━━━━━━━━━━━
📋 ORÇAMENTOS ABERTOS
━━━━━━━━━━━━━━━━

Total: 3 orçamento(s)

1️⃣ #123 - ORC-2610241430
   📝 RASCUNHO
   🚤 PB-002 - GRACINHA II
   💰 R$ 780,00
   📅 24/10/2026

2️⃣ #124 - ORC-2610241445
   📤 ENVIADO
   🚤 PB-003 - SUMMER
   💰 R$ 1.250,00
   📅 24/10/2026

━━━━━━━━━━━━━━━━
Digite o número para ver detalhes
ou 0 para voltar ao menu.
```

---

### **3️⃣ Orçamentos Fechados**

**Primeiro escolhe o período:**
```
━━━━━━━━━━━━━━━━
📅 PERÍODO DE CONSULTA
━━━━━━━━━━━━━━━━

Quantos dias para trás?

1️⃣ Últimos 7 dias
2️⃣ Últimos 15 dias
3️⃣ Últimos 30 dias
4️⃣ Últimos 60 dias
5️⃣ Últimos 90 dias
6️⃣ Todos

0️⃣ Voltar
```

**Depois mostra a lista:**
```
━━━━━━━━━━━━━━━━
✅ ORÇAMENTOS FECHADOS
━━━━━━━━━━━━━━━━
📅 Período: Últimos 30 dias

Total: 5 orçamento(s)

1️⃣ #120 - ORC-2609301200
   ✅ APROVADO
   🚤 PB-001 - MAVERICK
   💰 R$ 2.500,00
   📅 30/09/2026
```

---

### **4️⃣ Orçamentos por Embarcação**

**Lista embarcações com contagem:**
```
━━━━━━━━━━━━━━━━
🚤 ORÇAMENTOS POR EMBARCAÇÃO
━━━━━━━━━━━━━━━━

Selecione a embarcação:

1️⃣ PB-001 - MAVERICK (12)
2️⃣ PB-002 - GRACINHA II (8)
3️⃣ PB-003 - SUMMER (5)
4️⃣ PB-004 - DISCOVERY (3)

0️⃣ Voltar
```

---

### **5️⃣ Pendentes de Aprovação**

Lista orçamentos em `RASCUNHO` ou `ENVIADO`, ordenados do mais antigo

```
━━━━━━━━━━━━━━━━
⏰ PENDENTES DE APROVAÇÃO
━━━━━━━━━━━━━━━━

Total: 2 orçamento(s)
⚠️ Ordenado por mais antigo

1️⃣ #123 - ORC-2610241430
   📝 RASCUNHO (3 dias)
   🚤 PB-002 - GRACINHA II
   💰 R$ 780,00
   📅 21/10/2026
```

---

### **6️⃣ Pendentes de Cobrança**

Lista orçamentos `APROVADO` que ainda não geraram Conta a Receber

```
━━━━━━━━━━━━━━━━
💵 PENDENTES DE COBRANÇA
━━━━━━━━━━━━━━━━

📊 Total aprovados: 5
✅ Já cobrados: 3
⏳ Pendentes: 2

1️⃣ #122 - ORC-2610221500
   ⏰ Aprovado há 2 dias
   🚤 PB-002 - GRACINHA II
   💰 R$ 780,00
   📅 22/10/2026
```

---

## 🔍 DETALHES DO ORÇAMENTO

Ao clicar em um orçamento da lista:

```
━━━━━━━━━━━━━━━━
📋 DETALHES DO ORÇAMENTO
━━━━━━━━━━━━━━━━
🆔 Número: ORC-2610241430
📝 Status: RASCUNHO
🚤 Embarcação: PB-002 - GRACINHA II
📅 Data: 24/10/2026
━━━━━━━━━━━━━━━━
📌 TÍTULO:
Manutenção preventiva do motor
━━━━━━━━━━━━━━━━
📦 ITENS:
1. Troca de óleo do motor
   R$ 500,00
2. Filtro de óleo
   R$ 150,00
━━━━━━━━━━━━━━━━
💰 VALORES:
Subtotal: R$ 650,00
Taxa gestão (20%): R$ 130,00
TOTAL: R$ 780,00
━━━━━━━━━━━━━━━━

OPÇÕES:

1️⃣ 📋 Acessar HISTÓRICO (LOG)
2️⃣ ✏️ Editar itens
3️⃣ 📊 Definir rateio
4️⃣ ✅ Aprovar orçamento
5️⃣ 💵 Enviar cobrança
0️⃣ 🔙 Voltar

━━━━━━━━━━━━━━━━
Digite o número da opção:
```

---

## ✏️ EDITAR ITENS

**Opção 2 do menu de detalhes**

### **Menu de Edição:**
```
📦 EDITAR ITENS
━━━━━━━━━━━━━━━━
🆔 Orçamento: ORC-2610241430
🚤 PB-002
━━━━━━━━━━━━━━━━

1. Troca de óleo do motor
   R$ 500,00

2. Filtro de óleo
   R$ 150,00

━━━━━━━━━━━━━━━━

OPÇÕES:

Digite o número do item para editar
➕ A - Adicionar novo item
🗑️ E[número] - Excluir (ex: E2)
✅ S - Salvar e voltar

0️⃣ Cancelar
━━━━━━━━━━━━━━━━
```

---

### **➕ ADICIONAR ITEM**

Digite `A`:

**Passo 1 - Descrição:**
```
➕ ADICIONAR ITEM
━━━━━━━━━━━━━━━━
🆔 Orçamento: #123

Item #3 - Digite a descrição:

💡 Exemplo: Troca de óleo do motor

0️⃣ Cancelar
```

**Passo 2 - Valor:**
```
✅ Item #3: Mão de obra

━━━━━━━━━━━━━━━━
💰 VALOR DO ITEM
━━━━━━━━━━━━━━━━

Digite o valor (R$) ou "pular":

💡 Formatos aceitos:
• 500
• 500,50
• 5.000,50
• 5000,5

⏭️ Digite "pular" para definir depois

0️⃣ Cancelar
```

**Confirmação:**
```
✅ Item adicionado com sucesso!

📦 Item #3: Mão de obra
💰 R$ 320,00

Carregando lista atualizada...
```

**LOG registrado:** `ITEM_ADICIONADO`

---

### **✏️ EDITAR ITEM**

Digite o número do item (ex: `2`):

```
✏️ EDITAR ITEM #2
━━━━━━━━━━━━━━━━

Atual:
📦 Filtro de óleo
💰 R$ 150,00

━━━━━━━━━━━━━━━━

OPÇÕES:

1️⃣ Editar descrição
2️⃣ Editar valor
0️⃣ Cancelar

━━━━━━━━━━━━━━━━
Digite a opção:
```

#### **Editar Descrição (opção 1):**
```
✏️ EDITAR DESCRIÇÃO
━━━━━━━━━━━━━━━━
Item #2

Descrição atual:
Filtro de óleo

━━━━━━━━━━━━━━━━

Digite a nova descrição:

💡 Exemplo: Troca de óleo do motor

0️⃣ Cancelar
```

**Confirmação:**
```
✅ Descrição atualizada!

Antes: Filtro de óleo
Depois: Filtro de óleo novo

Carregando lista...
```

**LOG:** `ITEM_EDITADO - Descrição alterada de X para Y`

#### **Editar Valor (opção 2):**
```
✏️ EDITAR VALOR
━━━━━━━━━━━━━━━━
Item #2
Filtro de óleo

Valor atual:
R$ 150,00

━━━━━━━━━━━━━━━━

Digite o novo valor:

💡 Formatos aceitos:
• 500
• 500,50
• 5.000,50
• 5000,5

0️⃣ Cancelar
```

**Confirmação:**
```
✅ Valor atualizado!

📦 Filtro de óleo

Antes: R$ 150,00
Depois: R$ 180,00

Carregando lista...
```

**LOG:** `ITEM_EDITADO - Valor alterado de X para Y`

---

### **🗑️ EXCLUIR ITEM**

Digite `E2` (excluir item 2):

```
✅ Item excluído com sucesso!

📦 Item #2: Filtro de óleo

Carregando lista atualizada...
```

**Sistema:**
- Item excluído do banco
- Itens restantes reordenados automaticamente
- Total recalculado (subtotal, taxa, total)
- **LOG registrado:** `ITEM_EXCLUIDO`

---

### **✅ SALVAR E VOLTAR**

Digite `S`:

```
✅ Alterações salvas!

Carregando detalhes...
```

Retorna para o menu de detalhes do orçamento.

---

## 📋 SISTEMA DE LOG E HISTÓRICO

**Opção 1 do menu de detalhes**

### **Submenu de Histórico e Anexos:**

Ao escolher "1️⃣ Acessar HISTÓRICO (LOG)" no menu de detalhes:

```
━━━━━━━━━━━━━━━━
📋 HISTÓRICO E ANEXOS
━━━━━━━━━━━━━━━━
🆔 ORC-2610241430
📝 Manutenção preventiva do motor
🚤 PB-002
━━━━━━━━━━━━━━━━

OPÇÕES:

1️⃣ 📜 Ver LOG (histórico)
2️⃣ 📝 Registrar observação privada
3️⃣ 📎 Inserir anexo
4️⃣ 📂 Ver anexos
0️⃣ 🔙 Voltar

━━━━━━━━━━━━━━━━
Digite o número da opção:
```

---

### **1️⃣ VER LOG (Histórico)**

Mostra todas as ações realizadas no orçamento:

```
━━━━━━━━━━━━━━━━
📜 LOG (HISTÓRICO)
━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━
2026/10/24-15:05
Item #2: Valor alterado de R$ 150,00 para R$ 180,00
USR: 63999887766
━━━━━━━━━━━━━━━━
2026/10/24-15:04
Item #2: Descrição alterada de "Filtro" para "Filtro de óleo novo"
USR: 63999887766
━━━━━━━━━━━━━━━━
2026/10/24-15:03
Item #3: Mão de obra - R$ 320,00
USR: 63999887766
━━━━━━━━━━━━━━━━
2026/10/24-15:02
Item #2: Filtro de óleo - R$ 150,00
USR: 63999887766
━━━━━━━━━━━━━━━━
2026/10/24-14:58
Título: Manutenção preventiva do motor
Embarcação: PB-002
Valor Total: R$ 780,00
Itens: 2
USR: 63999887766
━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━
Digite 0 para voltar ao menu.
```

**Formato do telefone no LOG:**
- Exibe apenas os últimos 11 dígitos (padrão brasileiro: DDD + número)
- Exemplo: `63999887766` em vez do formato técnico completo

---

### **Tipos de LOG:**

| Ação | Quando | Informação Registrada |
|------|--------|----------------------|
| `ORCAMENTO_CRIADO` | Ao criar orçamento | Título, embarcação, valor total, qtd itens |
| `ITEM_ADICIONADO` | Ao adicionar item | Item #X: Descrição - Valor |
| `ITEM_EDITADO` | Ao editar item | Antes/depois (descrição ou valor) |
| `ITEM_EXCLUIDO` | Ao excluir item | Item #X: Descrição - Valor |
| `OBSERVACAO_PRIVADA` | Observação manual | Texto livre do usuário |

**Dados salvos em `orcamento_log`:**
- `id_orcamento` - ID do orçamento
- `acao` - Tipo da ação (ver tabela acima)
- `descricao` - Detalhes da ação
- `data_hora` - Timestamp (America/Sao_Paulo)
- `ip_origem` - Telefone WhatsApp (11 dígitos)

---

## 📝 OBSERVAÇÕES PRIVADAS

**Opção 2 do submenu de histórico**

### **Fluxo de Registro:**

**1. Solicitar observação:**
```
📝 REGISTRAR OBSERVAÇÃO PRIVADA
━━━━━━━━━━━━━━━━

Digite a observação que deseja registrar:

💡 Será registrado como LOG privado

0️⃣ Cancelar
```

**2. Digitar observação:**
```
Cliente solicitou prioridade na execução devido a viagem programada
```

**3. Confirmação:**
```
✅ Observação registrada com sucesso!

📝 Cliente solicitou prioridade na execução devido a viagem programada

Voltando ao menu...
```

### **Características:**
- ✅ Texto livre, sem limite de caracteres
- ✅ Registrado automaticamente no LOG
- ✅ Tipo de ação: `OBSERVACAO_PRIVADA`
- ✅ Inclui timestamp e usuário WhatsApp
- ✅ Aparece no histórico completo do orçamento
- ✅ Privado (não aparece para o cliente)

### **Casos de Uso:**
- 📌 Anotações sobre solicitações específicas do cliente
- 📌 Observações sobre prioridade ou urgência
- 📌 Lembretes sobre condições especiais
- 📌 Informações de contexto para a equipe

---

## 📎 SISTEMA DE ANEXOS

**Opções 3 e 4 do submenu de histórico**

### **Status:** 🚧 Em implementação

### **Funcionalidades Planejadas:**

#### **3️⃣ Inserir Anexo**
- Upload de arquivo via WhatsApp
- Nome amigável para o anexo
- Opção: Visível (cliente pode ver) ou Privado (só gestores)
- Múltiplos formatos suportados
- Múltiplos anexos por orçamento

#### **4️⃣ Ver Anexos**
- Listagem de todos os anexos do orçamento
- Indicação de anexos públicos vs privados
- Download/visualização via WhatsApp
- Data de upload e usuário

### **Padrão de Implementação:**
Seguirá o mesmo modelo usado nos **extratos bancários**, onde já existe sistema de anexos funcional.

---

## ✅ VALIDAÇÕES E REGRAS

### **1. Validação de Descrição**
```javascript
validarDescricao(texto)
```
- **Regra:** Mínimo 2 palavras de 3+ caracteres cada
- **Válido:** "Troca de óleo", "Filtro novo"
- **Inválido:** "Óleo", "Troca a" (palavras curtas)

### **2. Validação de Valor**
```javascript
formatarValor(texto)
```
**Formatos aceitos:**
- `500` → R$ 500,00
- `500,50` → R$ 500,50
- `5.000,50` → R$ 5.000,50
- `5000,5` → R$ 5.000,50

**Formato rejeitado:**
- `5000.50` → Erro (usar vírgula)

**Especial:**
- `pular` → null (define depois)

### **3. Validação de Status**
```javascript
// Só permite editar em:
status IN ('RASCUNHO', 'ENVIADO')

// Bloqueado em:
status IN ('APROVADO', 'CONCLUIDO', 'CANCELADO')
```

Mensagem ao tentar editar orçamento aprovado:
```
❌ Orçamento não pode ser editado

Status: APROVADO

Apenas orçamentos em RASCUNHO ou ENVIADO 
podem ser editados.
```

### **4. Cálculos Automáticos**

Sempre que item é adicionado/editado/excluído:

```javascript
// 1. Recalcular subtotal
subtotal = SUM(valor_total) de todos os itens

// 2. Calcular taxa (20% fixo)
taxa_valor = subtotal * 0.20

// 3. Total final
valor_total = subtotal + taxa_valor

// 4. Atualizar no banco
UPDATE orcamento_servico SET
  valor_servicos = subtotal,
  taxa_servico_valor = taxa_valor,
  valor_total = valor_total
```

### **5. Reordenação Automática**

Ao excluir item:
```sql
-- 1. Deletar item
DELETE FROM orcamento_item WHERE id_item = X

-- 2. Reordenar itens posteriores
UPDATE orcamento_item
SET ordem = ordem - 1
WHERE id_orcamento = Y
  AND ordem > Z
```

Garante que a numeração dos itens fique sempre sequencial: 1, 2, 3, 4...

---

## 🚧 FUNCIONALIDADES PENDENTES

### **Opção 3: Definir Rateio**
- [ ] Mostrar cotistas da embarcação
- [ ] Calcular divisão proporcional
- [ ] Salvar rateio no banco

### **Opção 4: Aprovar Orçamento**
- [ ] Mudar status para APROVADO
- [ ] Travar edição
- [ ] Registrar data/usuário aprovação

### **Opção 5: Enviar Cobrança**
- [ ] Gerar Contas a Receber
- [ ] Integrar com Asaas
- [ ] Enviar via WhatsApp

---

## 📊 ESTATÍSTICAS

**Linhas de código:** ~2.000 linhas  
**Funções implementadas:** 30+  
**Etapas de fluxo:** 15+  
**Tipos de validação:** 5+  
**Tipos de LOG:** 4  

---

## 🔗 INTEGRAÇÃO

### **Embarcações:**
```sql
SELECT * FROM "P_BOAT_1_Embarcacao"
WHERE "Cod_Cliente" = 4255
```

### **Grupo WhatsApp:**
- ID: `120363412373130577@g.us`
- Nome: Grupo ORÇAMENTOS
- Acesso via bot Marujo⚓

### **Timezone:**
Sempre `America/Sao_Paulo` (GMT-3)

---

## 📝 CHANGELOG

### **V.2610241503 - 24/10/2026**
- ✅ Menu de detalhes reformatado
- ✅ Sistema de LOG completo
- ✅ Edição completa de itens
- ✅ Validações de formato
- ✅ Cálculos automáticos
- ✅ Proteção por status

### **V.2610241422 - 24/10/2026**
- ✅ Criação de orçamento
- ✅ Menu principal
- ✅ Consultas básicas
- ✅ Estrutura inicial

---

## 🆘 SUPORTE

**Desenvolvedor:** Claude Sonnet 4.5  
**Projeto:** calendario_allmax  
**Repositório:** github.com/imobem-tech/calendario-boat  
**Deploy:** Railway  

---

**Documentação gerada em:** 24/10/2026 15:06  
**Última atualização:** V.2610241503
