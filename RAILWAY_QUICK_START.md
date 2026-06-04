# 🚀 Quick Start - Railway DEV
## V.2606041130

## ⚡ Passos Rápidos para Configurar DEV

### **1️⃣ No Railway Dashboard:**

#### **A) Criar Service DEV:**
1. Acesse: https://railway.app
2. Projeto: `calendario-boat`
3. Ambiente: **`deepproxyterminals`**
4. Clique em **"+ New Service"**
5. Selecione: **"GitHub Repository"**
6. Escolha: `imobem-tech/calendario-boat`
7. Branch: **`dev`** ⚠️ (não `main`)

#### **B) Configurar Variáveis de Ambiente:**
Vá em **Settings → Variables** e adicione:

```bash
RAILWAY_ENVIRONMENT=development
DATABASE_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

**⚠️ Adicionar depois (após escanear QR Code):**
- `NUMERO_WPP_DEV` → número de teste
- `GRUPO_ADM_DEV` → grupo de teste

#### **C) Deploy:**
Railway vai fazer deploy automático do branch `dev`.

---

### **2️⃣ Escanear QR Code DEV:**

1. Acesse URL do Railway DEV (algo como: `https://calendario-boat-dev.railway.app`)
2. Vá em: `/qr`
3. **Use número WhatsApp DIFERENTE do PROD**
4. Escaneie o QR Code
5. ✅ Bot DEV conectado

---

### **3️⃣ Criar Grupos de Teste:**

⚠️ **NUNCA adicione bot DEV em grupos reais de clientes!**

Crie grupos separados:
- `[TESTE] AllmaxPB1` (para testar embarcação)
- `[TESTE] ADM` (para testar comandos admin)

---

### **4️⃣ Validar:**

#### **Verificar logs Railway:**
```
🔧 Ambiente detectado: development
📋 Cron jobs: DESATIVADOS (apenas em production)
⚠️ Cron jobs desabilitados (ambiente: development)
```

#### **Testar comandos:**
- `ccc` → deve mostrar calendário ✅
- `rrr` → deve pedir localização ✅
- Aguardar 11h → **NÃO deve enviar alerta** ✅
- Aguardar 8h → **NÃO deve enviar previsão** ✅

---

## 🔄 Workflow Diário

### **Desenvolver:**
```bash
git checkout dev
# fazer alterações
git add .
git commit -m "feat: nova funcionalidade"
git push origin dev
```
→ Railway DEV atualiza automaticamente

### **Testar no bot DEV** (número diferente)

### **Aprovar para PROD:**
```bash
git checkout main
git merge dev
git push origin main
```
→ Railway PROD atualiza automaticamente

---

## ⚠️ Regras Importantes

### **✅ PODE fazer no DEV:**
- Testar comandos manuais (ccc, rrr, ppp)
- Testar localização
- Testar criação de grupos
- Testar API REST
- Adicionar bot apenas em **grupos de teste**

### **❌ NÃO PODE fazer no DEV:**
- Adicionar bot em grupos reais de clientes
- Esperar alertas automáticos (desabilitados)
- Usar mesmo número WhatsApp do PROD

---

## 🆘 Problemas Comuns

| Problema | Solução |
|----------|---------|
| Cron jobs rodando no DEV | Adicionar `RAILWAY_ENVIRONMENT=development` |
| Mensagens duplicadas | Bot DEV está em grupos reais → remover |
| Bot não conecta | Acessar `/qr` e escanear novamente |
| Deploy falhou | Verificar logs no Railway |

---

## 📚 Documentação Completa

Ver: `RAILWAY_DEV_CONFIG.md`
