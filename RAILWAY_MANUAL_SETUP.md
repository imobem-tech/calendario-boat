# 🎯 Setup Railway DEV - Passo a Passo
## V.2606041145

## ⚠️ Railway não tem API pública para criar services automaticamente

A configuração precisa ser feita **via Dashboard**, mas é rápida (5 minutos).

---

## 📋 **Passo a Passo Completo:**

### **1. Acessar Railway Dashboard**
🔗 https://railway.app/dashboard

### **2. Selecionar Projeto**
- Clique no projeto: **`calendario-boat`**
- No canto superior direito, selecione ambiente: **`deepproxyterminals`**

### **3. Criar Novo Service**
1. Clique: **"+ New"** (botão roxo)
2. Selecione: **"GitHub Repository"**
3. Escolha repositório: **`imobem-tech/calendario-boat`**
4. ⚠️ **IMPORTANTE:** Na próxima tela, configure:
   - **Branch:** `dev` (NÃO deixe `main`)
   - **Root Directory:** deixe vazio
   - Clique: **"Deploy"**

### **4. Aguardar Build Inicial**
Railway vai começar o deploy do branch `dev`. Aguarde até aparecer:
```
✓ Build successful
✓ Deployment live
```

### **5. Configurar Variáveis de Ambiente**
1. No service recém-criado, clique: **"Variables"** (na barra lateral)
2. Clique: **"+ New Variable"**
3. Adicione uma por uma:

**Variável 1:**
```
Name: RAILWAY_ENVIRONMENT
Value: development
```

**Variável 2:**
```
Name: DATABASE_URL
Value: postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

**Variável 3:**
```
Name: POSTGRES_URL
Value: postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

4. Clique: **"Deploy"** (Railway vai fazer redeploy com as variáveis)

### **6. Obter URL Pública**
1. Vá em: **"Settings"** → **"Networking"**
2. Clique: **"Generate Domain"**
3. Railway vai gerar uma URL tipo:
   ```
   https://calendario-boat-dev-production.up.railway.app
   ```
4. **Copie essa URL!**

### **7. Verificar Logs**
1. Vá em: **"Deployments"** (barra lateral)
2. Clique no deployment ativo (bolinha verde)
3. Verifique se aparece nos logs:
   ```
   🔧 Ambiente detectado: development
   📋 Cron jobs: DESATIVADOS (apenas em production)
   ⚠️ Cron jobs desabilitados (ambiente: development)
   ```

✅ Se aparecer isso, configuração correta!

### **8. Escanear QR Code**
1. Acesse: `https://[sua-url].railway.app/qr`
2. **Use número WhatsApp DIFERENTE do PROD**
3. Abra WhatsApp no celular
4. Vá em: **Dispositivos Conectados** → **Conectar dispositivo**
5. Escaneie o QR Code
6. ✅ Bot DEV conectado!

### **9. Criar Grupos de Teste**
⚠️ **NUNCA adicione bot DEV em grupos reais!**

Crie grupos separados:
- **`[TESTE] AllmaxPB1`** (para testar embarcação)
- **`[TESTE] ADM`** (para testar comandos admin)

Adicione o bot DEV apenas nesses grupos.

### **10. Validar Funcionamento**
Teste no grupo de teste:
- `ccc` → deve mostrar calendário ✅
- `rrr` → deve pedir localização ✅
- Aguarde 11h → **NÃO deve enviar alerta** ✅
- Aguarde 8h → **NÃO deve enviar previsão** ✅

---

## 🔄 **Deploy Automático Configurado!**

Depois dessa configuração inicial, todo push no branch `dev` vai fazer deploy automático:

```bash
git checkout dev
# fazer alterações
git add .
git commit -m "feat: nova funcionalidade"
git push origin dev
```
→ Railway DEV atualiza sozinho! 🚀

---

## 📊 **URLs Importantes:**

Depois de configurado, salve essas URLs:

| Função | URL |
|--------|-----|
| **QR Code** | `https://[sua-url].railway.app/qr` |
| **Status Bot** | `https://[sua-url].railway.app/status` |
| **Mapa Rastreamento** | `https://[sua-url].railway.app/` |
| **Dashboard Railway** | https://railway.app/dashboard |

---

## 🆘 **Troubleshooting:**

### **Deploy falhou:**
- Verificar se branch está correto: `dev`
- Verificar logs em "Deployments"

### **Bot não conecta:**
- Verificar se `RAILWAY_ENVIRONMENT=development` está configurado
- Acessar `/qr` novamente e escanear

### **Cron jobs ainda ativos:**
- Verificar logs se aparece "DESATIVADOS"
- Se não aparecer, variável `RAILWAY_ENVIRONMENT` está faltando

### **Mensagens duplicadas:**
- Bot DEV está em grupos reais → remover imediatamente
- Usar apenas grupos de teste

---

## 📞 **Suporte:**

- **Repositório:** https://github.com/imobem-tech/calendario-boat
- **Branch DEV:** https://github.com/imobem-tech/calendario-boat/tree/dev
- **Railway:** https://railway.app
