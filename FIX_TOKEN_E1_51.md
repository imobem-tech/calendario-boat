# 🔧 Correção: Token gerando grupo E1 como 51
## V.2606041315

## 🐛 **PROBLEMA:**

**Grupo 573-E1** gerava link de agendamento mostrando **"Emb 573 - 51"** ❌

**Token:** `egceadbcdjfjdci`

**URL:** https://allmaxcalendar.vercel.app/?t=egceadbcdjfjdci

**Resultado no banco:** Agendamentos gravavam `Grupo_Comp_letra = "51"` em vez de `"E1"`

---

## 🔍 **CAUSA RAIZ:**

### **Arquivo: `api/agendar.js` linhas 75-76**

**Código ERRADO:**
```javascript
const primeiroGrupo = decodificar(m[2]);  // ← BUG!
const grupoFinal = primeiroGrupo ? `${primeiroGrupo}${grupoNum}` : `${grupoLetra}${grupoNum}`;
```

### **O que acontecia:**

1. Token: `egceadbcdjfjdci`
2. Regex captura: `m[2] = "e"` (a letra codificada do grupo)
3. **Linha 56:** `grupoLetra = "E"` (uppercase) ✅
4. **Linha 75:** `primeiroGrupo = decodificar("e")` ❌
   - Função `decodificar("e")` retorna `"5"` (porque no código `e=5`)
5. **Linha 76:** `grupoFinal = "5" + "1" = "51"` ❌

### **Deveria ser:**
- `grupoFinal = "E" + "1" = "E1"` ✅

---

## ✅ **CORREÇÃO IMPLEMENTADA:**

### **Código NOVO:**
```javascript
// Monta grupo final: letra já está uppercase em grupoLetra (linha 56)
const grupoFinal = `${grupoLetra}${grupoNum}`;

return {
  pb,
  grupo: grupoFinal,
  codAutorizado: autorizado,
  token: t
};
```

### **Lógica Corrigida:**

- Remove tentativa de decodificar a letra
- Usa diretamente `grupoLetra` (já está uppercase na linha 56)
- Concatena com `grupoNum` (já decodificado)
- Resultado: `"E" + "1" = "E1"` ✅

---

## 🧪 **TESTE DE VALIDAÇÃO:**

**Arquivo:** `test_decode_token.js`

**Resultado:**
```
Token: egceadbcdjfjdci

❌ VERSÃO ANTIGA:
  Grupo Final: 51
  Debug: "5" + "1" = "51"

✅ VERSÃO NOVA:
  Grupo Final: E1

📊 COMPARAÇÃO:
  ANTES: Emb 573 - 51 ❌
  AGORA: Emb 573 - E1 ✅

✅ BUG CORRIGIDO!
```

---

## 📊 **IMPACTO:**

### **✅ Grupos afetados (TODOS com letra):**

Qualquer grupo no formato LetraNúmero era afetado:

| Grupo Real | Token letra | Decodificado ERRADO | Decodificado CORRETO |
|------------|-------------|---------------------|----------------------|
| **E1** | e | 51 ❌ | E1 ✅ |
| A1 | a | 11 ❌ | A1 ✅ |
| I1 | i | 91 ❌ | I1 ✅ |
| S1 | s | (não numérico) | S1 ✅ |
| T2 | t | (não numérico) | T2 ✅ |

**Grupos mais afetados:** A, B, C, D, E, F, G, H, I (letras que codificam dígitos)

### **✅ O que melhora:**

1. **Página web** mostra grupo correto
2. **Banco de dados** grava grupo correto nos agendamentos futuros
3. **Validações** funcionam corretamente
4. **Relatórios** mostram dados corretos

### **⚠️ Agendamentos antigos:**

Agendamentos já gravados com grupo errado **permanecem errados** no banco.

**Se necessário corrigir:**
```sql
-- Exemplo: corrigir E1 gravado como 51
UPDATE public."P_BOAT_z_10_Saida_Emb"
SET "Grupo_Comp_letra" = 'E1'
WHERE "Cod_Emb_PB" = 573
  AND "Grupo_Comp_letra" = '51';
```

---

## 🚀 **DEPLOY:**

### **Status:**
- ✅ Código corrigido
- ✅ Teste criado e validado
- ✅ Commit no branch `dev`
- ⏳ Aguardando deploy Railway DEV
- ⏳ Testes no DEV
- ⏳ Merge para `main` (PROD)

### **Commits:**
- `30919cb` - Correção do decode token E1→51
- Arquivo: `api/agendar.js` (V.2606041310)

---

## 📝 **RESUMO:**

| Item | Status |
|------|--------|
| **Bug identificado** | ✅ Linha 75 decodificava letra erradamente |
| **Correção implementada** | ✅ Usa grupoLetra diretamente |
| **Teste criado** | ✅ test_decode_token.js |
| **Commitado** | ✅ Branch `dev` |
| **Deploy DEV** | ⏳ Automático ao push |
| **Deploy PROD** | ⏳ Após testes |

---

## 🔗 **Arquivos Relacionados:**

- **Corrigido:** `api/agendar.js` (função `decodeToken`)
- **Teste:** `test_decode_token.js`
- **Debug:** `debug_token_573.js` (investigação)
- **Geração:** `wpp/token.js` (geração estava correta)

---

## 🎯 **PRÓXIMOS PASSOS:**

1. ✅ Deploy automático no Railway DEV
2. ⏳ Testar URL: https://zucchini-achievement-desenvolvimento.up.railway.app/?t=egceadbcdjfjdci
3. ⏳ Verificar se mostra "573-E1" (não mais "573-51")
4. ⏳ Fazer agendamento teste e verificar banco
5. ⏳ Merge para `main` e deploy PROD
