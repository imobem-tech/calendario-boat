# 🚀 DEPLOY FINAL - ATIVAR SISTEMA BANCÁRIO
**V.260911214500**

---

## 📋 PRÉ-REQUISITOS (JÁ FEITO)

✅ Rotas bancárias criadas  
✅ Webhook Asaas configurado  
✅ Token configurado  
✅ Grupos WhatsApp cadastrados  
✅ Variáveis no Railway adicionadas:
   - ASAAS_WEBHOOK_SECRET
   - GRUPO_FINANCEIRO_ALLMAX
   - GRUPO_FINANCEIRO_IMOBEM
   - GRUPO_FINANCEIRO_IMOBAN
   - GRUPO_FINANCEIRO_SUMMER

---

## 🎯 COMANDOS PARA EXECUTAR À NOITE

### **PASSO 1: Preparar o deploy**

```bash
cd C:\Users\NOTEBOOK\projetos\calendario_allmax

# Verificar que está na branch dev
git branch

# Adicionar server.js modificado
git add wpp/server.js

# Ver o que vai ser commitado
git status
```

### **PASSO 2: Commit**

```bash
git commit -m "feat: Ativar sistema bancário

- Importar rotas bancárias
- Inicializar sistema ao conectar WhatsApp
- Versão atualizada: Allmax®260911Bank

Funcionalidades ativas:
- Webhook Asaas (tempo real)
- Sincronização Sicredi (6h)
- Classificação automática
- 4 empresas: ALLMAX, IMOBEM, IMOBAN, SUMMER

Endpoints:
- POST /api/banco/asaas/webhook
- POST /api/banco/sicredi/sync
- GET /api/banco/status

V.260911204500

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### **PASSO 3: Push para DEV (testar primeiro)**

```bash
# Push para dev
git push origin dev
```

**Railway vai fazer deploy automático em ~2 minutos**

---

## ✅ VERIFICAR SE DEU CERTO (DEV)

### **1. Ver logs do Railway**

```
Railway Dashboard → calendario-boat → deepproxyterminals (DEV)
→ Deployments → Último deploy → View Logs
```

**Procure por:**
```
================================================================================
💰 SISTEMA BANCÁRIO - INICIALIZADO
================================================================================

🔔 Webhooks ativos:
   ✓ Asaas: POST /api/banco/asaas/webhook

🔄 Sincronização automática:
   ✓ Sicredi: a cada 6 horas

📊 Endpoints disponíveis:
   POST /api/banco/sicredi/sync  → Sincronizar manualmente
   GET  /api/banco/status        → Ver status da sincronização

🏦 Empresas configuradas:
   • ALLMAX  → Asaas + Sicredi
   • IMOBEM  → Asaas
   • IMOBAN  → Asaas
   • SUMMER  → Asaas + Sicredi

================================================================================
```

### **2. Testar endpoint de status**

```
https://zucchini-achievement-desenvolvimento.up.railway.app/api/banco/status
```

**Resposta esperada:**
```json
{
  "executando": false,
  "ultima_sicredi": null,
  "proxima_sicredi": "Aguardando primeira execução"
}
```

### **3. Testar webhook no Asaas**

```
Asaas → Webhooks → Extratos_Bancarios → Testar
```

**Se retornar 200 OK, funcionou!** ✅

---

## 🚀 SE DEV ESTIVER OK, DEPLOY PARA PRODUÇÃO

### **PASSO 4: Merge para main**

```bash
# Ir para main
git checkout main

# Merge do dev
git merge dev

# Ver o que foi mergeado
git log -1

# Push para produção
git push origin main
```

**Railway vai fazer deploy automático em production (~2 minutos)**

---

## ✅ VERIFICAR PRODUÇÃO

### **1. Ver logs do Railway (PRODUCTION)**

```
Railway Dashboard → calendario-boat → production
→ Deployments → Último deploy → View Logs
```

**Procure por:**
```
VERSAO SERVER: Allmax®260911Bank  ← Nova versão!
✅ WhatsApp conectado!
💰 SISTEMA BANCÁRIO - INICIALIZADO  ← Funcionou!
```

### **2. Testar endpoint de status (PRODUCTION)**

```
https://calendario-boat-production.up.railway.app/api/banco/status
```

### **3. Testar webhook real**

**Fazer uma cobrança teste no Asaas:**
- Criar cobrança pequena (R$ 0,01)
- Marcar como paga manualmente
- Verificar se chegou no banco de dados:

```sql
SELECT * FROM bank_extratos
WHERE tipo_importacao = 'WEBHOOK'
ORDER BY importado_em DESC
LIMIT 5;
```

**Se apareceu, está TUDO FUNCIONANDO!** 🎉

---

## ⚠️ SE DER PROBLEMA (REVERTER)

### **Voltar para versão anterior:**

```bash
# Copiar backup de volta
cp wpp/backup/20260911_server_ORIGINAL.js wpp/server.js

# Commit
git add wpp/server.js
git commit -m "revert: Voltar server.js para versão anterior

Motivo: [descrever o problema]"

# Push
git push origin main
```

**Railway volta para versão anterior em ~2 minutos**

---

## 📊 CHECKLIST FINAL

Antes de fazer o deploy, confirme:

- [ ] Backup do server.js criado (20260911_server_ORIGINAL.js)
- [ ] Variáveis no Railway adicionadas (5 variáveis)
- [ ] Webhook Asaas configurado e ativo
- [ ] Grupos WhatsApp identificados (4 grupos)
- [ ] É noite (para não afetar trabalho do pessoal)
- [ ] Tem 10 minutos livres (para testar depois)

Depois do deploy, testar:

- [ ] Logs mostram "SISTEMA BANCÁRIO - INICIALIZADO"
- [ ] Endpoint /api/banco/status responde
- [ ] Webhook Asaas retorna 200 OK
- [ ] Versão mudou para "Allmax®260911Bank"
- [ ] WhatsApp continua conectado
- [ ] Outros sistemas não foram afetados

---

## 🎯 RESUMO ULTRA-RÁPIDO

```bash
# À noite, executar:
cd C:\Users\NOTEBOOK\projetos\calendario_allmax
git add wpp/server.js
git commit -m "feat: Ativar sistema bancário - V.260911204500"
git push origin dev

# Testar DEV → Se OK:
git checkout main
git merge dev
git push origin main

# Aguardar deploy (2 min)
# Verificar logs
# Testar endpoints
# 🎉 PRONTO!
```

---

**Tempo total estimado: 10 minutos (incluindo testes)**

**V.260911214500**
