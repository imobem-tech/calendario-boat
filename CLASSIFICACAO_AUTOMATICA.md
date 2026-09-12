# 🤖 Sistema Inteligente de Classificação Automática

**Versão:** V.260912120000  
**Branch:** `dev` (deploy à noite)  
**Status:** Pronto para produção

---

## 📋 RESUMO

Sistema de classificação automática de lançamentos bancários em **3 prioridades**, com suporte a **palavras-chave inteligentes** (wildcards, normalização, case-insensitive).

**REGRA CRÍTICA:** Todo lançamento classificado automaticamente fica **PENDENTE** até anexar recibo.

---

## 🎯 PRIORIDADES DE CLASSIFICAÇÃO

### ✅ PRIORIDADE 1: Asaas externalReference
- **O que é:** Pagamentos Asaas que têm `externalReference`
- **Como funciona:** Busca cobrança em `bank_asaas_charges` pelo `external_reference`
- **Vantagem:** 100% de precisão (vinculado direto à cobrança)
- **Exemplo:** Pagamento de mensalidade de barco com externalReference

### ✅ PRIORIDADE 2: Palavras-chave evidentes
- **O que é:** Match por palavras-chave na descrição
- **Como funciona:**
  - Busca categorias com campo `palavras_chave` preenchido
  - Testa cada palavra contra a descrição
  - Suporta wildcards (`*`) e word boundaries
- **Vantagem:** Flexível, customizável, fácil de manter
- **Exemplo:** Descrição "Aluguel terreno XYZ" → match palavra "aluguel"

### ✅ PRIORIDADE 3: Regras antigas
- **O que é:** Compatibilidade com tabela `bank_regras_classificacao`
- **Como funciona:** Usa CONTEM ou VALOR_EXATO da tabela antiga
- **Vantagem:** Mantém regras existentes funcionando
- **Status:** Fallback para regras antigas

---

## 🔤 SISTEMA DE PALAVRAS-CHAVE

### Formato
```
palavra1,palavra2,*parcial*,Palavra Exata
```

**Separador:** Vírgula (`,`)  
**Sem aspas**

### Tipos de Match

#### 1️⃣ Palavra Exata (word boundary)
```
aluguel  → ✅ "Pagamento de aluguel janeiro"
aluguel  → ❌ "Alugueizinho de casa"
```

#### 2️⃣ Wildcard com asterisco (*)
```
*loca*   → ✅ "Locação de imóvel"
*loca*   → ✅ "Locadora de veículos"
Bar*     → ✅ "Barco 123"
Bar*     → ✅ "Barracão norte"
Bar*     → ❌ "Embarcação"
```

### Normalização
- **Case-insensitive:** `VIDA` = `vida` = `Vida`
- **Remove acentos:** `locação` = `locacao`
- **Remove cedilha:** `prestação` = `prestacao`

### Exemplos Reais

```javascript
// IMOBEM - Seguro de Vida
palavras_chave: "VIDA,Ct_3o,*terceiro*"

// IMOBEM - Aluguel de Imóveis
palavras_chave: "aluguel,*locação*,*loca*"

// IMOBEM - Compra de Lotes/Terrenos
palavras_chave: "lote,terreno,*imóvel*,*imovel*,prestação"

// IMOBEM - Telefonia
palavras_chave: "celular,telefone,*telecom*,*vivo*,*tim*,*claro*"

// ALLMAX - Combustível
palavras_chave: "combustível,*gasolina*,*diesel*,*combustivel*"
```

---

## 🔄 STATUS WORKFLOW

```
┌─────────────────────────────────────────────────┐
│  Webhook Asaas recebe lançamento                │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│  Classificação automática (3 prioridades)       │
│  ✅ Categoria identificada                       │
│  ⚠️  Status = PENDENTE                           │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│  Pessoa anexa recibo via WhatsApp               │
│  Bot processa com Claude Vision                 │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│  Status muda para OK                            │
│  ✅ Lançamento completo                          │
└─────────────────────────────────────────────────┘
```

**IMPORTANTE:** Mesmo que a classificação seja 100% precisa, status fica **PENDENTE** até recibo!

---

## 📁 ARQUIVOS CRIADOS/MODIFICADOS

### ✅ Novos Arquivos (branch dev)

#### `wpp/routes/banco/classificacao-automatica.js`
**Versão:** V.260912120000  
**Função:** Motor de classificação inteligente

**Funções principais:**
- `removeAcentos(str)` - Normaliza strings
- `testarPalavraChave(description, palavraChave)` - Testa match
- `classificarPagamentoAsaas()` - Prioridade 1
- `tentarClassificacaoAutomatica()` - Prioridade 2
- `classificarPorRegrasAntigas()` - Prioridade 3
- `classificarLancamento()` - Orquestrador geral

#### `migration_palavras_chave.js`
**Versão:** V.260912120000  
**Função:** Script de migração

**O que faz:**
1. Cria extensão `unaccent` no PostgreSQL
2. Adiciona coluna `palavras_chave TEXT` em `bank_categorias`
3. Popula palavras-chave iniciais

**Como executar:**
```bash
node migration_palavras_chave.js
```

### ✅ Arquivos Modificados (branch dev)

#### `wpp/routes/banco/asaas-webhook.js`
**Nova versão:** V.260912120000  
**Mudanças:**
- Importa `classificarLancamento`
- Substitui função `tentarClassificarAutomatico`
- Status SEMPRE PENDENTE

#### `wpp/routes/banco/index.js`
**Pendente:** Adicionar import da classificação (se necessário)

---

## 🗄️ ESTRUTURA DO BANCO

### Coluna Nova: `bank_categorias.palavras_chave`
```sql
ALTER TABLE bank_categorias
ADD COLUMN IF NOT EXISTS palavras_chave TEXT;
```

**Tipo:** TEXT (palavras separadas por vírgula)  
**Nullable:** Sim (categorias sem palavras-chave não participam da classificação)  
**Exemplo:** `"VIDA,Ct_3o,*terceiro*"`

### Extensão: unaccent
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```

**Função:** Normalizar texto (remover acentos) em queries SQL  
**Usado em:** Prioridade 3 (regras antigas)

---

## 🚀 DEPLOY À NOITE

### Checklist

- [x] Branch `dev` criada
- [x] Arquivos criados/modificados
- [x] Documentação completa
- [ ] **EXECUTAR À NOITE:**
  1. Rodar migração: `node migration_palavras_chave.js`
  2. Testar classificação em dev
  3. Merge dev → main
  4. Push para production (Railway)
  5. Monitorar logs

---

## 🧪 COMO TESTAR (DEV)

### 1️⃣ Rodar migração
```bash
cd C:\Users\NOTEBOOK\projetos\calendario_allmax
node migration_palavras_chave.js
```

### 2️⃣ Adicionar palavras-chave manualmente
```sql
UPDATE bank_categorias
SET palavras_chave = 'combustível,*gasolina*,*diesel*'
WHERE id = 10 AND empresa = 'ALLMAX';
```

### 3️⃣ Testar via SQL
```javascript
import { classificarLancamento } from './wpp/routes/banco/classificacao-automatica.js';

const resultado = await classificarLancamento({
  externalReference: null,
  description: 'Pagamento gasolina posto BR',
  value: 250.00,
  tipo: 'DEBITO',
  empresa: 'ALLMAX'
});

console.log(resultado);
// {
//   categoria_id: 10,
//   categoria_nome: 'Combustível',
//   status: 'PENDENTE',
//   metodo: 'Palavra-chave: "*gasolina*"'
// }
```

### 4️⃣ Testar via Webhook
Enviar evento Asaas para:
```
POST https://calendario-boat-production.up.railway.app/api/banco/asaas/webhook?empresa=ALLMAX
```

---

## 📊 MONITORAMENTO

### Logs a observar
```
✅ [P1-Asaas] Classificado por externalReference: Mensalidade Barco
✅ [P2-Palavras] Match: "aluguel" → Aluguel de Imóveis
✅ [P3-Regras] Classificado por regra antiga: Energia Elétrica
ℹ️  Nenhuma regra encontrada para: "Transferência desconhecida"
```

### Queries úteis
```sql
-- Ver lançamentos PENDENTES
SELECT id, data, descricao_original, classificacao, status
FROM bank_extratos
WHERE status = 'PENDENTE'
ORDER BY data DESC;

-- Ver categorias com palavras-chave
SELECT id, nome, palavras_chave
FROM bank_categorias
WHERE palavras_chave IS NOT NULL;

-- Estatísticas de classificação
SELECT
  classificado_por,
  COUNT(*) as total
FROM bank_extratos
WHERE classificacao IS NOT NULL
GROUP BY classificado_por;
```

---

## 🔧 MANUTENÇÃO

### Adicionar nova palavra-chave
```sql
UPDATE bank_categorias
SET palavras_chave = palavras_chave || ',*nova palavra*'
WHERE id = 32;
```

### Remover palavra-chave
```sql
UPDATE bank_categorias
SET palavras_chave = REPLACE(palavras_chave, ',palavra_antiga', '')
WHERE id = 32;
```

### Listar hits por palavra-chave
Adicionar log temporário em `classificacao-automatica.js`:
```javascript
console.log(`✅ Match: "${palavra}" em "${description}"`);
```

---

## ⚠️ AVISOS IMPORTANTES

1. **NÃO fazer deploy durante o DIA** (regra de ouro!)
2. **SEMPRE testar em dev primeiro**
3. **Rodar migração ANTES de fazer merge**
4. **Status PENDENTE é obrigatório** (não mudar sem recibo)
5. **Palavras-chave sem aspas** (vírgula como separador)

---

## 📝 HISTÓRICO DE VERSÕES

### V.260912120000 (branch dev) ✨ ATUAL
- Sistema de classificação em 3 prioridades
- Palavras-chave com wildcards e normalização
- Status PENDENTE obrigatório

### V.260912100000 (main - PRODUÇÃO)
- Dropdown de categorias funcionando
- Vercel Blob operacional
- Upload de recibos OK

---

## 🤝 PRÓXIMOS PASSOS

1. ✅ **Documentação completa** (este arquivo)
2. ⏳ **Deploy à noite** (aguardando)
3. 📊 **Monitorar logs** (após deploy)
4. 🎯 **Ajustar palavras-chave** (conforme uso real)
5. 🧠 **Machine Learning?** (futuro - analisar padrões)

---

**Criado em:** 12/09/2026  
**Autor:** Claude + Usuário  
**Branch:** dev  
**Status:** Aguardando deploy noturno 🌙
