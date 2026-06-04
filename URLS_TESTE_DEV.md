# 🔗 URLs para Teste - DEV vs PROD
## V.2606041335

## 📋 **Token de Teste:** `egceadbcdjfjdci`
**Grupo esperado:** E1 (não 51)

---

## 🟢 **PREVIEW (DEV) - Com correção:**

### **URL Preview mais recente (5 min atrás):**
```
https://allmaxcalendar-hv1lvgaie-imobem-9109s-projects.vercel.app/?t=egceadbcdjfjdci
```

**Esperado:** Mostrar **"Emb 573 - E1"** ✅

---

## 🔴 **PRODUCTION - Sem correção (2 dias atrás):**

### **URL Production (branch main):**
```
https://allmaxcalendar.vercel.app/?t=egceadbcdjfjdci
```

**Atual:** Mostra **"Emb 573 - 51"** ❌ (bug ainda presente)

---

## 🧪 **Como Testar:**

### **1. Teste Preview (DEV):**
1. Acesse: https://allmaxcalendar-hv1lvgaie-imobem-9109s-projects.vercel.app/?t=egceadbcdjfjdci
2. Verifique se mostra: **"Emb 573 - E1"**
3. Se mostrar E1 ✅ → correção funcionou no DEV

### **2. Teste Production (PROD):**
1. Acesse: https://allmaxcalendar.vercel.app/?t=egceadbcdjfjdci
2. Verá: **"Emb 573 - 51"** (bug antigo)
3. Após merge `dev → main` → vai mostrar E1 ✅

---

## 📊 **Status dos Ambientes:**

| Ambiente | Branch | Deploy | Correção E1 | URL |
|----------|--------|--------|-------------|-----|
| **Preview** | `dev` | 5 min atrás | ✅ SIM | allmaxcalendar-hv1lvgaie... |
| **Production** | `main` | 2 dias | ❌ NÃO | allmaxcalendar.vercel.app |
| **Railway DEV** | `dev` | Ativo | ⚠️ Só bot | zucchini-achievement... |

---

## 🚀 **Próximos Passos:**

### **Se Preview DEV mostrar E1 correto:**

1. Fazer merge para PROD:
   ```bash
   cd C:\Users\NOTEBOOK\projetos\calendario_allmax
   git checkout main
   git merge dev
   git push origin main
   ```

2. Aguardar deploy automático do Vercel (~1 minuto)

3. Testar PROD novamente:
   ```
   https://allmaxcalendar.vercel.app/?t=egceadbcdjfjdci
   ```

4. **Resultado esperado:** "Emb 573 - E1" ✅

---

## 🔍 **Verificar qual branch está em qual URL:**

```powershell
cd C:\Users\NOTEBOOK\projetos\calendario_allmax
vercel ls
```

**Preview** = branch `dev` (correções)  
**Production** = branch `main` (sem correções ainda)

---

## ⚠️ **IMPORTANTE:**

- A URL `allmaxcalendar.vercel.app` (sem hash) é SEMPRE **Production**
- URLs com hash (ex: `allmaxcalendar-hv1lvgaie-...`) são **Preview** (testes)
- Usuários finais usam a **Production**, então precisa fazer merge!

---

## 📝 **Commits Pendentes de Merge:**

```
dev → main (pendente)
├── 47038fe - docs: Documentação E1→51
├── 30919cb - fix: Token E1→51
├── c55a436 - fix: Cod_Proprietário
└── ... (mais 2 commits)
```

**Total:** 5 commits de correção esperando merge para PROD
