# 🔧 Correção: Embarcação 565 pedindo HM indevidamente
## V.2606041255

## 🐛 **PROBLEMA ORIGINAL:**

Embarcação **PB 565** estava pedindo **Hora Motor (HM) na saída**, mas não deveria.

---

## 🔍 **INVESTIGAÇÃO:**

### **1. Lógica do Código (wpp/comandos/saida.js linha 436):**
```javascript
const precisaHoraMotor =
  Number(saida['Cod_Proprietário']) === 4255 &&
  (
    saida.Hora_Motor_Saida === null ||
    saida.Hora_Motor_Saida === undefined ||
    saida.Hora_Motor_Saida === ''
  )
```

**Regra:** Se `Cod_Proprietário === 4255` E não tem HM → **pede HM na saída**

### **2. Dados da Embarcação 565:**

**✅ Tabela de Autorizados (P_BOAT_4_Autorizados):**
- Cod_Pessoa: **3689** (SERGIO ALVES CORREA)
- Status: ATIVO ✅

**❌ Agendamento Atual (P_BOAT_z_10_Saida_Emb ID 15847):**
- Cod_Proprietário: **4255** ❌ (ALLMAX - pede HM)
- Cod_Autorizado: 3689 ✅

**Cod_Proprietário estava ERRADO no agendamento!**

### **3. Causa Raiz:**

**Arquivo `api/agendar.js` linha 345:**
```javascript
[
  proximoCodigo,
  codEmbPB,
  4255,  // ← HARDCODED! Sempre gravava 4255
  codAutorizado,
  dataHoraAgendamento,
  grupo
]
```

**TODAS as saídas agendadas pelo site entravam com proprietário 4255!**

---

## ✅ **CORREÇÃO IMPLEMENTADA:**

### **Arquivo: `api/agendar.js`**

**ANTES (linha 345):**
```javascript
4255,  // Sempre fixo
```

**DEPOIS (linhas 320-336):**
```javascript
// Buscar proprietário correto da tabela P_BOAT_4_Autorizados
const rsProprietario = await client.query(
  `SELECT "Cod_Pessoa"
     FROM public."P_BOAT_4_Autorizados"
    WHERE "Cod_Embarcacao" = $1
      AND "Cod_Pessoa" = $2
      AND "Dt_Desautorizacao" IS NULL
      AND "Dt_Cancelamento" IS NULL
    LIMIT 1`,
  [codEmbPB, codAutorizado]
);

// Se encontrou autorizado ativo, usa ele como proprietário
// Senão, usa 4255 (Allmax) como fallback
const codProprietario = rsProprietario.rows.length > 0
  ? rsProprietario.rows[0].Cod_Pessoa
  : 4255;
```

**Nova versão:** V.2606041250

---

## 📊 **IMPACTO DA CORREÇÃO:**

### **✅ Novos Agendamentos:**
- Embarcação 565 (proprietário 3689) → **NÃO pede HM** ✅
- Embarcações da Allmax (proprietário 4255) → **continua pedindo HM** ✅
- Outras embarcações → usam o proprietário correto

### **⚠️ Agendamentos Antigos:**
- ID 15847 (e outros anteriores) ainda têm `Cod_Proprietário = 4255`
- **Precisam ser corrigidos manualmente no banco** (se necessário)

---

## 🛠️ **CORREÇÃO MANUAL (SE NECESSÁRIO):**

Para corrigir agendamentos antigos que ainda estão com 4255 errado:

```sql
-- Corrigir agendamento específico de hoje (PB 565)
UPDATE public."P_BOAT_z_10_Saida_Emb"
SET "Cod_Proprietário" = 3689
WHERE "ID" = 15847;

-- OU corrigir TODOS os agendamentos da PB 565 que têm 4255 errado
UPDATE public."P_BOAT_z_10_Saida_Emb" s
SET "Cod_Proprietário" = a."Cod_Pessoa"
FROM public."P_BOAT_4_Autorizados" a
WHERE s."Cod_Emb_PB" = a."Cod_Embarcacao"
  AND s."Cod_Autorizado" = a."Cod_Pessoa"
  AND s."Cod_Proprietário" = 4255
  AND s."Cod_Emb_PB" = 565
  AND a."Dt_Desautorizacao" IS NULL
  AND a."Dt_Cancelamento" IS NULL;
```

---

## 🧪 **COMO TESTAR:**

### **1. Criar novo agendamento via web:**
- Acessar: `https://[url]/public/agendar.html`
- Fazer agendamento para PB 565
- Verificar no banco:
  ```sql
  SELECT "Cod_Emb_PB", "Cod_Proprietário", "Cod_Autorizado"
  FROM public."P_BOAT_z_10_Saida_Emb"
  WHERE "Cod_Emb_PB" = 565
  ORDER BY "ID" DESC
  LIMIT 1;
  ```
- **Esperado:** `Cod_Proprietário = 3689` (não mais 4255)

### **2. Testar comando sss no WhatsApp:**
- Enviar `sss` no grupo da PB 565
- **Esperado:** NÃO deve pedir Hora Motor
- Deve pedir direto: "Confirma saída? S/N"

### **3. Testar embarcação Allmax:**
- Fazer agendamento de embarcação que É da Allmax
- **Esperado:** `Cod_Proprietário = 4255` (correto)
- Comando `sss` **deve pedir** Hora Motor

---

## 📝 **RESUMO:**

| Item | Status |
|------|--------|
| **Causa identificada** | ✅ api/agendar.js hardcoded 4255 |
| **Correção implementada** | ✅ Busca proprietário da tabela de autorizados |
| **Código commitado** | ✅ Branch `dev` |
| **Testado** | ⚠️ Aguardando deploy DEV |
| **Deploy PROD** | ⏳ Após testes no DEV |

---

## 🚀 **PRÓXIMOS PASSOS:**

1. ✅ **Deploy no Railway DEV** (branch `dev`)
2. ⏳ **Testar agendamento no DEV**
3. ⏳ **Merge para `main` se OK**
4. ⏳ **Deploy automático PROD**
5. ⏳ **Corrigir agendamentos antigos no banco** (se necessário)

---

## 📞 **Arquivos Modificados:**

- `api/agendar.js` (V.2606041250)
- Commit: `1956dcc` no branch `dev`
