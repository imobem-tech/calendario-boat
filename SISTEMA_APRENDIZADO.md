# 🧠 SISTEMA DE APRENDIZADO AUTOMÁTICO

**Versão:** V.260912150000  
**Branch:** `dev` (commit 03fdb43)  
**Status:** ⚠️ **PARCIAL - Falta implementar comando WhatsApp**

---

## 📋 **RESUMO**

Sistema que permite ao usuário "ensinar" o sistema a classificar lançamentos automaticamente sem precisar de recibo.

### **Lógica:**
```
┌─────────────────────────────┐
│ Lançamento novo             │
└──────────┬──────────────────┘
           │
     ┌─────┴─────┐
     │ É cobrança│
     │  Asaas?   │
     └─────┬─────┘
       SIM │ NÃO
         │ │
         │ └──> chave_aprendida → OK (não precisa recibo)
         │
         └──> palavras_chave → PENDENTE (precisa recibo)
```

---

## 🗄️ **BANCO DE DADOS**

### **Campo novo:**
```sql
ALTER TABLE bank_categorias
ADD COLUMN chave_aprendida TEXT;
```

### **Formato:**
```
frase_chave|valor_inteiro|tolerancia_percent|observacao
```

### **Exemplo:**
```
Hora_MOTOR 586-E2|98|10|X, TARIFA MANUT CONTA|15|0|Taxa mensal
```

**Separadores:**
- `|` (pipe) → campos dentro de uma regra
- `,` (vírgula) → múltiplas regras

---

## 🔧 **ARQUIVOS MODIFICADOS**

### ✅ **IMPLEMENTADO:**

1. **`migration_chave_aprendida.js`** (NOVO)
   - Adiciona coluna `chave_aprendida`
   - Executar: `node migration_chave_aprendida.js`

2. **`classificacao-automatica.js`** (MODIFICADO)
   - Remove Prioridade 1 (externalReference inútil)
   - Adiciona `testarChaveAprendida()` com valor ± tolerância
   - Adiciona `salvarRegraAprendida()` para persistir
   - Modifica `classificarLancamento()` para identificar tipo

3. **`asaas-webhook.js`** (MODIFICADO)
   - Passa `tipo_importacao` e `id_transacao_banco`
   - Atualiza observação se vier de regra aprendida

4. **`ver_palavras_chave.js`** (NOVO - utilitário)
   - Lista categorias com palavras-chave
   - Executar: `node ver_palavras_chave.js`

---

### ⚠️ **FALTA IMPLEMENTAR:**

5. **`comando-pendentes.js`** ← **CRÍTICO!**
   - Adicionar opção "aprender" em recibos
   - Fluxo: copy/paste descrição + tolerância
   - Chamar `salvarRegraAprendida()`
   - Remover opção "o", usar "gravar" direto

---

## 📱 **FLUXO NO WHATSAPP (A IMPLEMENTAR)**

### **Mensagem de recibo (NOVA):**
```
📎 RECIBO/COMPROVANTE (OPCIONAL)

Envie uma foto ou PDF do recibo,
ou escolha uma das opções:

━━━━━━━━━━━━━━━━
✏️ Opções:
📎 Envie o arquivo
⏭️ Digite "pular" (continua PENDENTE)
🧠 Digite "aprender" (marca OK + cria regra)
```

### **Se usuário digitar "aprender":**

**Passo 1:**
```
🧠 CRIAR REGRA AUTOMÁTICA

📝 DESCRIÇÃO DO LANÇAMENTO:
Hora_MOTOR 586-E2 11/09/2026 0.3h

━━━━━━━━━━━━━━━━
✂️ COPIE a descrição acima e COLE
   somente o trecho que deve ser comparado

✏️ Cole o trecho:
```

**Passo 2:**
```
💰 TOLERÂNCIA DE VALOR

Valor deste lançamento: R$ 98,93

━━━━━━━━━━━━━━━━
Digite o % de tolerância:

• 0 = Somente R$ 98 (valor exato)
• 10 = De R$ 88 até R$ 108 (±10%)
• 50 = De R$ 49 até R$ 148 (±50%)

✏️ Digite o %:
```

**Passo 3:**
```
✅ REGRA CRIADA COM SUCESSO!

📌 Categoria: Reenbolso Combustível HM
🔍 Trecho: "Hora_MOTOR 586-E2"
💰 Valor: R$ 98 ± 10%
💬 Observação: "X"
✨ Status: OK (não precisa recibo)

━━━━━━━━━━━━━━━━
📚 Próximos lançamentos com:
✅ "Hora_MOTOR 586-E2" na descrição
✅ Valor entre R$ 88 e R$ 108

Vão automaticamente para:
✅ Categoria 7
✅ Observação "X"
✅ Status OK
```

---

## 🎯 **COMO FUNCIONA**

### **1. Identificar tipo de lançamento:**
```javascript
const isCobrancaAsaas = (
  tipo_importacao === 'WEBHOOK' ||
  id_transacao_banco?.startsWith('pay_')
);
```

### **2. Classificar:**

#### **Se COBRANÇA Asaas:**
```javascript
palavras_chave → categoria → PENDENTE
```

#### **Se OUTROS:**
```javascript
chave_aprendida → categoria + observação → OK
```

### **3. Testar chave aprendida:**
```javascript
// Descrição: "Hora_MOTOR 586-E2 15/09/2026 0.5h"
// Valor: R$ 105,00

// Regra: "Hora_MOTOR 586-E2|98|10|X"
frase: "Hora_MOTOR 586-E2" ✅ (contém)
valor: 105 vs 98 ± 10% = [88-108] ✅ (dentro)

→ Match! Categoria + Obs "X" + Status OK
```

---

## 🚀 **DEPLOY NOTURNO**

### **Checklist:**

**ANTES DO MERGE:**
- [ ] Implementar comando "aprender" em `comando-pendentes.js`
- [ ] Testar localmente o fluxo completo
- [ ] Rodar migração: `node migration_chave_aprendida.js`

**MERGE PARA MAIN:**
- [ ] `git checkout main`
- [ ] `git merge dev`
- [ ] `git push origin main`

**APÓS DEPLOY:**
- [ ] Verificar logs Railway
- [ ] Testar comando `lll` (listar pendentes)
- [ ] Testar comando `aprender X`
- [ ] Verificar classificação automática

---

## 📊 **EXEMPLOS**

### **Categoria com chave aprendida:**
```sql
SELECT id, nome, chave_aprendida
FROM bank_categorias
WHERE id = 7;

-- Resultado:
id: 7
nome: "Reenbolso Combustível HM"
chave_aprendida: "Hora_MOTOR 586-E2|98|10|X, Hora_MOTOR 590-F1|164|15|X"
```

### **Lançamento que entra automático:**
```
Descrição: "Hora_MOTOR 586-E2 20/09/2026 0.4h"
Valor: R$ 105,00
Tipo: CREDITO
Importação: SYNC (não é cobrança)

→ Testa chave_aprendida
→ Match: frase + valor
→ Categoria 7 + Obs "X" + Status OK
→ NÃO aparece em pendentes!
```

---

## ⚠️ **STATUS ATUAL**

| Item | Status |
|------|--------|
| Migração banco | ✅ Criado |
| Lógica classificação | ✅ Implementado |
| Webhook Asaas | ✅ Modificado |
| Comando WhatsApp | ❌ **FALTA!** |
| Testes | ⏳ Pendente |
| Deploy | ⏳ À noite |

---

**Próximo passo:** Implementar fluxo "aprender" em `comando-pendentes.js`

---

**Criado em:** 12/09/2026 15:00  
**Branch:** dev  
**Commit:** 03fdb43
