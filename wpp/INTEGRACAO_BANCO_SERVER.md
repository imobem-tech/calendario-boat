# 🔌 INTEGRAÇÃO SISTEMA BANCÁRIO NO SERVER.JS
**V.260911204000**

---

## 📋 O QUE FOI CRIADO

✅ **Webhooks Asaas** → Recebe lançamentos em tempo real  
✅ **Sincronização Sicredi** → Polling manual a cada 6 horas  
✅ **Sistema de Cron** → Automação da sincronização  
✅ **Trigger WhatsApp** → Sincroniza ao detectar movimento no grupo financeiro

---

## 🚀 PASSOS DE INTEGRAÇÃO

### **1. ADICIONAR ROTAS NO `server.js`**

Edite o arquivo `C:\Users\NOTEBOOK\projetos\calendario_allmax\wpp\server.js`

**Adicionar IMPORT no topo do arquivo** (após as outras importações):

```javascript
// Depois da linha ~54 (após import { handleLocalizacao... })
import bancoRoutes, {
  inicializarSistemaBancario,
  triggerSincronizacaoWhatsApp
} from './routes/banco/index.js';
```

**Adicionar ROTAS** (após `app.use(express.json())` — linha ~98):

```javascript
// Depois da linha ~98
// Rotas bancárias
app.use('/api/banco', bancoRoutes);
```

**Inicializar sistema** (dentro do evento `connection.update` quando conectar):

```javascript
// Dentro do sock.ev.on('connection.update', ...) 
// Após a linha que imprime "✅ WhatsApp conectado"

if (update.connection === 'open') {
  console.log('✅ WhatsApp conectado')
  
  // ADICIONAR AQUI:
  inicializarSistemaBancario();
  
  // ... resto do código
}
```

---

### **2. INTEGRAR TRIGGER WHATSAPP (OPCIONAL)**

Se quiser que o sistema sincronize automaticamente quando alguém postar no grupo financeiro:

**Dentro do evento de mensagens** (`sock.ev.on('messages.upsert', ...)`):

```javascript
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const m of messages) {
    if (!m.key.fromMe && m.message) {
      const grupoId = m.key.remoteJid;
      
      // GRUPOS FINANCEIROS (substituir pelos IDs reais)
      const gruposFinanceiros = [
        '120363XXXALLMAX@g.us',   // Grupo Financeiro ALLMAX
        '120363XXXSUMMER@g.us',   // Grupo Financeiro SUMMER
        '120363XXXIMOBEM@g.us',   // Grupo Financeiro IMOBEM
        '120363XXXIMOBAN@g.us'    // Grupo Financeiro IMOBAN
      ];
      
      // Se for mensagem em grupo financeiro, disparar sincronização
      if (gruposFinanceiros.includes(grupoId)) {
        console.log('💰 Movimento no grupo financeiro detectado');
        
        // Dispara sincronização em background (não aguarda)
        triggerSincronizacaoWhatsApp('SICREDI').catch(err => {
          console.error('❌ Erro ao disparar sincronização:', err);
        });
      }
      
      // ... resto do código de processamento de mensagens
    }
  }
});
```

---

### **3. CONFIGURAR WEBHOOK ASAAS**

**No painel do Asaas:**

1. Acesse: https://www.asaas.com/
2. Vá em **Configurações > Webhooks**
3. Adicione nova URL:

```
https://SEU_DOMINIO_RAILWAY.up.railway.app/api/banco/asaas/webhook
```

**Eventos para marcar:**
- ✅ PAYMENT_RECEIVED
- ✅ PAYMENT_CONFIRMED
- ✅ PAYMENT_CREATED
- ✅ TRANSFER_CREATED
- ✅ PAYMENT_REFUNDED
- ✅ PAYMENT_UPDATED

---

### **4. INSTALAR DEPENDÊNCIAS (SE NECESSÁRIO)**

```bash
cd C:\Users\NOTEBOOK\projetos\calendario_allmax
npm install
```

Já deve ter tudo instalado:
- ✅ `express`
- ✅ `pg`
- ✅ `dotenv`

---

## 🧪 TESTAR A INTEGRAÇÃO

### **1. Testar endpoint de status:**

```bash
curl http://localhost:8080/api/banco/status
```

Resposta esperada:
```json
{
  "executando": false,
  "ultima_sicredi": null,
  "proxima_sicredi": "Aguardando primeira execução"
}
```

### **2. Disparar sincronização manual:**

```bash
curl -X POST http://localhost:8080/api/banco/sicredi/sync
```

### **3. Simular webhook Asaas:**

```bash
curl -X POST http://localhost:8080/api/banco/asaas/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "PAYMENT_RECEIVED",
    "payment": {
      "id": "pay_123456",
      "dateCreated": "2026-09-11T14:30:00.000Z",
      "customer": "cus_abc",
      "value": 2500.00,
      "netValue": 2487.50,
      "billingType": "PIX",
      "status": "RECEIVED",
      "description": "Teste de integração",
      "paymentDate": "2026-09-11"
    }
  }'
```

---

## 📊 ESTRUTURA CRIADA

```
wpp/
├── routes/
│   └── banco/
│       ├── index.js              → Rotas principais + inicialização
│       ├── asaas-webhook.js      → Processamento webhook Asaas
│       ├── sicredi-sync.js       → Sincronização Sicredi (polling)
│       └── cron-sync.js          → Sistema de cron automático
└── server.js                     → [MODIFICAR] Adicionar imports e rotas
```

---

## 🎯 PRÓXIMOS PASSOS

### **Imediato:**
1. ✅ Integrar rotas no `server.js`
2. ✅ Configurar webhook no painel Asaas
3. ✅ Testar com lançamento real

### **Quando tiver acesso ao Sicredi:**
1. Adicionar credenciais (Client ID, Secret, Certificado)
2. Implementar `buscarTransacoesSicredi()` em `sicredi-sync.js`
3. Ajustar estrutura de dados conforme API real

### **Opcional:**
1. Criar tabela `bank_logs_sincronizacao` para auditoria
2. Adicionar notificações no WhatsApp quando houver erros
3. Dashboard web para visualizar sincronizações

---

## 🔐 VARIÁVEIS DE AMBIENTE

Certifique-se que o `.env` ou variáveis do Railway têm:

```env
DATABASE_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
PORT=8080
```

---

## 🏦 EMPRESAS E BANCOS

| Empresa | Asaas | Sicredi |
|---------|-------|---------|
| ALLMAX  | ✅    | ✅      |
| IMOBEM  | ✅    | ❌      |
| IMOBAN  | ✅    | ❌      |
| SUMMER  | ✅    | ✅      |

---

## 📝 LOGS E MONITORAMENTO

Os logs aparecem no console do servidor:

```
🔔 Webhook Asaas recebido: {...}
✅ Lançamento processado: abc123...
✅ Classificado automaticamente: Combustível (confiança: 0.85)

🔄 Sincronização automática Sicredi iniciada...
📊 Sincronizando ALLMAX - Ag 0101 Cc 12345
✅ ALLMAX: 5 novos, 2 duplicados
```

---

## ❓ DÚVIDAS FREQUENTES

**Q: Como identificar qual empresa é cada webhook Asaas?**  
A: Por enquanto está fixo como ALLMAX. Futuramente podemos:
- Usar API Keys diferentes por empresa
- Adicionar parâmetro na URL do webhook
- Identificar pelo customer ID

**Q: E se o servidor cair? Perde lançamentos?**  
A: Não! Quando voltar, a sincronização periódica busca os últimos dias.

**Q: Posso testar sem ter API do Sicredi?**  
A: Sim! O código já está preparado. Retorna array vazio enquanto não tem acesso.

---

**Tudo pronto para integrar!** 🚀

**V.260911204000**
