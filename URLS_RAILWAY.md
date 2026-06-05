# 🔗 URLs Railway - DEV vs PROD
## V.2606041215

## 🌐 **Ambiente DEV (desenvolvimento)**

### **Base URL:**
```
https://zucchini-achievement-desenvolvimento.up.railway.app
```

### **Endpoints Principais:**

| Função | URL |
|--------|-----|
| **🏠 Home / Mapa** | https://zucchini-achievement-desenvolvimento.up.railway.app/ |
| **📱 QR Code WhatsApp** | https://zucchini-achievement-desenvolvimento.up.railway.app/qr |
| **📊 Status Bot** | https://zucchini-achievement-desenvolvimento.up.railway.app/status |
| **🔄 Sincronizar Grupos** | https://zucchini-achievement-desenvolvimento.up.railway.app/sincronizar-grupos-agenda |
| **📨 API Retorno Externa** | https://zucchini-achievement-desenvolvimento.up.railway.app/msg_externa/retorno |

### **🔧 Características DEV:**
- ✅ Branch: `dev`
- ✅ Ambiente: `development`
- ✅ Cron jobs: **DESATIVADOS**
- ⚠️ Número WhatsApp: **DIFERENTE do PROD**
- ⚠️ Grupos: **APENAS DE TESTE**

---

## 🏭 **Ambiente PROD (produção)**

### **Base URL:**
```
https://calendario-boat-production.up.railway.app
```
*(Ajustar se necessário)*

### **Endpoints Principais:**

| Função | URL |
|--------|-----|
| **🏠 Home / Mapa** | https://calendario-boat-production.up.railway.app/ |
| **📱 QR Code WhatsApp** | https://calendario-boat-production.up.railway.app/qr |
| **📊 Status Bot** | https://calendario-boat-production.up.railway.app/status |

### **🔧 Características PROD:**
- ✅ Branch: `main`
- ✅ Ambiente: `production` (após atualizar)
- ✅ Cron jobs: **ATIVADOS**
- ✅ Número WhatsApp: **Real (clientes)**
- ✅ Grupos: **Reais (clientes)**

---

## 🧪 **Como Testar DEV:**

### **1. Escanear QR Code:**
```
https://zucchini-achievement-desenvolvimento.up.railway.app/qr
```
⚠️ Use número **DIFERENTE** do PROD

### **2. Verificar Status:**
```
https://zucchini-achievement-desenvolvimento.up.railway.app/status
```
Deve mostrar: `conectado: true`

### **3. Ver Mapa de Localização:**
```
https://zucchini-achievement-desenvolvimento.up.railway.app/
```

### **4. Criar Grupos de Teste:**
- `[TESTE] AllmaxPB1`
- `[TESTE] ADM`

### **5. Testar Comandos:**
No grupo de teste:
- `ccc` → calendário
- `rrr` → localização
- `ppp` → previsão do tempo

---

## 📊 **Script de Validação:**

Execute para verificar saúde do DEV:
```powershell
cd C:\Users\NOTEBOOK\projetos\calendario_allmax
.\validar-railway-dev.ps1
```

---

## ⚠️ **REGRAS IMPORTANTES:**

### **✅ PODE fazer no DEV:**
- Testar comandos manuais
- Testar funcionalidades novas
- Criar grupos de teste
- Adicionar bot em grupos `[TESTE]`

### **❌ NÃO PODE fazer no DEV:**
- Adicionar bot em grupos reais
- Usar mesmo número do PROD
- Esperar alertas automáticos (desativados)
- Testar com dados de clientes reais

---

## 🔄 **Workflow de Desenvolvimento:**

1. **Desenvolver no branch `dev`:**
   ```bash
   git checkout dev
   git add .
   git commit -m "feat: nova funcionalidade"
   git push origin dev
   ```

2. **Railway DEV atualiza automaticamente**

3. **Testar na URL DEV** (link acima)

4. **Quando estável, mover para PROD:**
   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```

5. **Railway PROD atualiza automaticamente**

---

## 📞 **Links Importantes:**

- **Railway Dashboard:** https://railway.app/dashboard
- **Repositório GitHub:** https://github.com/imobem-tech/calendario-boat
- **Branch DEV:** https://github.com/imobem-tech/calendario-boat/tree/dev

---

## 🛠️ **Troubleshooting:**

### **DEV não conecta:**
1. Verificar logs: https://railway.app → calendario-boat → deepproxyterminals
2. Procurar: `Ambiente detectado: desenvolvimento`
3. Se não aparecer, falta variável `RAILWAY_ENVIRONMENT`

### **Cron jobs ativos no DEV:**
1. Verificar logs
2. Se aparecer "ATIVADOS", branch está errado (`main` em vez de `dev`)

### **Mensagens duplicadas:**
Bot DEV está em grupos reais → remover imediatamente
