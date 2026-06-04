# 🎯 Setup Railway DEV - Método Mais Rápido
## V.2606041200

## ⚡ **Método Recomendado: Dashboard (5 minutos)**

A API do Railway não permite automação completa. Use o dashboard (é rápido):

---

## 📋 **PASSO A PASSO:**

### **1. Abrir Railway**
🔗 **https://railway.app/dashboard**

### **2. Selecionar Projeto e Ambiente**
- Clique no projeto: **`calendario-boat`**
- Canto superior direito: **`deepproxyterminals`** (ambiente DEV)

### **3. Criar Service (3 cliques)**
1. Botão: **"+ New"** (roxo no canto)
2. Escolha: **"GitHub Repository"**
3. Selecione: **`imobem-tech/calendario-boat`**

### **4. IMPORTANTE: Configurar Branch**
⚠️ Na tela que aparecer:
- **Source Repo:** `imobem-tech/calendario-boat` ✅
- **Branch:** `dev` ⚠️ **MUDAR DE `main` PARA `dev`**
- **Root Directory:** (deixar vazio)
- Clique: **"Deploy"**

### **5. Aguardar Deploy Inicial (1-2 min)**
Aguarde até ver:
```
✓ Build successful
✓ Deployment live
```

### **6. Adicionar Variáveis (COPIAR/COLAR)**

Clique em **"Variables"** (menu lateral) → **"+ New Variable"**

**Cole estas 3 variáveis:**

```bash
RAILWAY_ENVIRONMENT=development
```

```bash
DATABASE_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

```bash
POSTGRES_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

### **7. Gerar URL Pública**
- Menu: **"Settings"** → **"Networking"**
- Botão: **"Generate Domain"**
- Railway cria: `https://calendario-XXXX.up.railway.app`
- **📋 COPIE ESSA URL!**

### **8. Verificar Logs (VALIDAÇÃO CRÍTICA)**
- Menu: **"Deployments"**
- Clique no deployment ativo (verde)
- **DEVE APARECER:**
```
🔧 Ambiente detectado: development
📋 Cron jobs: DESATIVADOS (apenas em production)
⚠️ Cron jobs desabilitados (ambiente: development)
```

✅ **Se aparecer isso = configuração correta!**
❌ **Se NÃO aparecer = variável RAILWAY_ENVIRONMENT faltando**

### **9. Escanear QR Code**
- Acesse: `https://[sua-url].railway.app/qr`
- **📱 Use número WhatsApp DIFERENTE do PROD**
- WhatsApp → **Dispositivos Conectados** → **Conectar**
- Escaneie o QR

### **10. Testar (GRUPOS DE TESTE APENAS)**
⚠️ **NUNCA adicionar bot DEV em grupos reais!**

Crie:
- `[TESTE] AllmaxPB1`
- `[TESTE] ADM`

Teste no grupo:
- `ccc` → calendário ✅
- `rrr` → localização ✅
- Aguardar 11h → **SEM alerta** ✅

---

## ✅ **CHECKLIST FINAL:**

- [ ] Service criado no ambiente `deepproxyterminals`
- [ ] Branch configurado: `dev` (não `main`)
- [ ] 3 variáveis adicionadas
- [ ] Logs mostram: "Ambiente detectado: development"
- [ ] Logs mostram: "Cron jobs: DESATIVADOS"
- [ ] URL pública gerada
- [ ] QR Code escaneado com número diferente
- [ ] Bot adicionado apenas em grupos de teste
- [ ] Comandos `ccc` e `rrr` funcionando

---

## 🔄 **Deploy Automático Configurado!**

Depois dessa configuração inicial:

```bash
git checkout dev
git add .
git commit -m "feat: nova funcionalidade"
git push origin dev
```
→ Railway DEV atualiza sozinho! 🚀

---

## 📊 **URLs para Salvar:**

| Função | URL |
|--------|-----|
| **QR Code** | `https://[sua-url].railway.app/qr` |
| **Status** | `https://[sua-url].railway.app/status` |
| **Mapa** | `https://[sua-url].railway.app/` |

---

## 🆘 **Problemas Comuns:**

### ❌ Logs mostram "Cron jobs: ATIVADOS"
**Causa:** Branch errado (`main` em vez de `dev`)  
**Solução:** Settings → Source → Branch: `dev`

### ❌ Logs não mostram mensagem de ambiente
**Causa:** Falta variável `RAILWAY_ENVIRONMENT`  
**Solução:** Variables → Adicionar `RAILWAY_ENVIRONMENT=development`

### ❌ Mensagens duplicadas
**Causa:** Bot DEV em grupos reais  
**Solução:** Remover de TODOS os grupos reais, usar apenas teste

### ❌ Deploy falhou
**Solução:** Deployments → Ver logs de erro

---

## 💡 **Dica:**

Salve a URL gerada em algum lugar seguro. Você vai usar:
- `/qr` → escanear QR
- `/status` → verificar bot
- `/` → ver mapa

---

## 📞 **Pronto!**

Depois de configurado, me avise a URL gerada que posso criar:
- Script de validação automática
- Testes de integração
- Monitoramento DEV vs PROD
