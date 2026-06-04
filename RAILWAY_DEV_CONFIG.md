# Configuração Railway - Ambiente DEV vs PROD
## V.2606041130

## 🎯 Objetivo
Isolar ambiente de testes (DEV) do ambiente de produção (PROD) para evitar:
- Mensagens duplicadas
- Loop entre bots
- Alertas automáticos em testes
- Interferência em grupos de clientes

---

## 🏗️ Arquitetura

### **Branch Git:**
- `main` → PROD (Railway Production)
- `dev` → DEV (Railway deepproxyterminals)

### **Detecção de Ambiente:**
O código identifica o ambiente via variável `RAILWAY_ENVIRONMENT`:
```javascript
const AMBIENTE = process.env.RAILWAY_ENVIRONMENT || 'development'
const IS_PRODUCTION = AMBIENTE === 'production'
```

---

## ⚙️ Variáveis de Ambiente Railway

### **PROD (Production):**
```bash
RAILWAY_ENVIRONMENT=production
DATABASE_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
ASAAS_API_KEY=<chave_producao>
NUMERO_WPP_PROD=<numero_producao>
GRUPO_ADM=<grupo_adm_prod>
```

### **DEV (deepproxyterminals):**
```bash
RAILWAY_ENVIRONMENT=development
DATABASE_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
ASAAS_API_KEY=<mesma_chave_ou_sandbox>
NUMERO_WPP_DEV=<numero_teste_diferente>
GRUPO_ADM_DEV=<grupo_teste>
```

**⚠️ IMPORTANTE:** 
- **Banco de dados:** mesmo para ambos (Neon PostgreSQL)
- **Número WhatsApp:** DEVE ser diferente (escanear QR Code diferente no DEV)
- **Grupos:** DEV usa apenas grupos de teste (nunca grupos de clientes)

---

## 🚫 Comportamento DEV vs PROD

### **Cron Jobs (Alertas Automáticos):**
| Funcionalidade | PROD | DEV |
|---|---|---|
| Processamento de fila (10s) | ✅ Ativo | ❌ Desabilitado |
| Alerta HM 11h | ✅ Ativo | ❌ Desabilitado |
| Verificação 70m (5min) | ✅ Ativo | ❌ Desabilitado |
| Previsão diária 8h | ✅ Ativo | ❌ Desabilitado |
| Verificação posições expiradas | ✅ Ativo | ❌ Desabilitado |

### **Funcionalidades Manuais:**
| Funcionalidade | PROD | DEV |
|---|---|---|
| Comandos bot (ccc, rrr, ppp) | ✅ | ✅ |
| Localização em tempo real | ✅ | ✅ |
| Criação de grupos | ✅ | ⚠️ Apenas teste |
| API REST (`/msg_externa`) | ✅ | ✅ |

---

## 📋 Checklist Deploy DEV

### **1. Railway Dashboard:**
- [ ] Criar service no ambiente `deepproxyterminals`
- [ ] Conectar ao repositório GitHub `imobem-tech/calendario-boat`
- [ ] Configurar branch: `dev`
- [ ] Adicionar variáveis de ambiente (seção acima)

### **2. WhatsApp DEV:**
- [ ] Usar número diferente do PROD
- [ ] Escanear QR Code no Railway DEV
- [ ] **NÃO adicionar em grupos de clientes**
- [ ] Criar grupos de teste separados

### **3. Validação:**
- [ ] Verificar logs: `Ambiente detectado: development`
- [ ] Confirmar: `Cron jobs: DESATIVADOS`
- [ ] Testar comandos manuais funcionando
- [ ] Verificar que alertas automáticos NÃO disparam

---

## 🔄 Workflow de Desenvolvimento

1. **Desenvolver localmente:**
   ```bash
   git checkout dev
   # Fazer alterações
   git add .
   git commit -m "feat: nova funcionalidade"
   git push origin dev
   ```

2. **Railway DEV atualiza automaticamente**
   - Deploy automático do branch `dev`
   - Testar no bot DEV (número diferente)

3. **Aprovar e mover para PROD:**
   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```

4. **Railway PROD atualiza automaticamente**
   - Deploy automático do branch `main`
   - Bot PROD (número real) recebe atualização

---

## 🐛 Troubleshooting

### **Bot DEV enviando mensagens duplicadas:**
❌ **Causa:** Número DEV está em grupos de clientes  
✅ **Solução:** Remover bot DEV de todos os grupos reais, usar apenas grupos de teste

### **Cron jobs rodando no DEV:**
❌ **Causa:** Variável `RAILWAY_ENVIRONMENT` não configurada  
✅ **Solução:** Adicionar `RAILWAY_ENVIRONMENT=development` no Railway

### **Bot DEV não conecta:**
❌ **Causa:** QR Code não foi escaneado ou sessão expirou  
✅ **Solução:** Acessar `https://<url-railway-dev>.railway.app/qr` e escanear novamente

---

## 📞 Contatos
- **Desenvolvedor:** Allmax Gestão
- **Repositório:** https://github.com/imobem-tech/calendario-boat
- **Railway PROD:** Production environment
- **Railway DEV:** deepproxyterminals environment
