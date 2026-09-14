# 📚 Documentação de API - Allmax Gestão

**Projeto:** Sistema Integrado de Gestão Bancária + WhatsApp Bot + Agendamento de Embarcações  
**URL Base:** `https://calendario-boat-production.up.railway.app`  
**Versão:** V.2609141800

---

## 🏦 **1. SISTEMA BANCÁRIO**

### **Webhooks e Sincronização**

#### `POST /api/banco/asaas/webhook`
Recebe eventos do Asaas em tempo real (webhook)

**Query Parameters:**
- `empresa` - Código da empresa (ALLMAX, IMOBEM, SUMMER)

**Body:** Payload do evento Asaas

**Eventos suportados:**
- `PAYMENT_RECEIVED` - Pagamento recebido
- `PAYMENT_CONFIRMED` - Pagamento confirmado
- `PAYMENT_OVERDUE` - Pagamento vencido
- `PAYMENT_DELETED` - Cobrança excluída
- E mais 10 eventos...

---

#### `POST /api/banco/sicredi/sync`
Dispara sincronização manual do Sicredi

**Response:**
```json
{
  "sucesso": true,
  "mensagem": "Sincronização disparada",
  "lancamentos_novos": 15,
  "timestamp": "2026-09-14T17:30:00-03:00"
}
```

---

#### `GET /api/banco/status`
Retorna status da sincronização automática

**Response:**
```json
{
  "ativo": true,
  "proxima_execucao": "2026-09-14T23:00:00-03:00",
  "ultima_execucao": "2026-09-14T17:00:00-03:00",
  "lancamentos_hoje": 45
}
```

---

## 📊 **2. EXTRATO BANCÁRIO**

#### `GET /api/banco/extrato/listar`
Lista lançamentos bancários com filtros

**Query Parameters:**
- `empresa` - Código da empresa (obrigatório)
- `ano` - Ano (ex: 2026)
- `mes` - Mês (1-12)
- `status` - Status (PENDENTE, OK, ERRO)
- `tipo` - Tipo (ENTRADA, SAIDA)
- `categoria_id` - ID da categoria
- `data_inicio` - Data inicial (YYYY-MM-DD)
- `data_fim` - Data final (YYYY-MM-DD)

**Response:**
```json
{
  "sucesso": true,
  "total": 150,
  "lancamentos": [
    {
      "id": 1234,
      "empresa": "ALLMAX",
      "data": "2026-09-14",
      "descricao": "PIX - João Silva",
      "valor": 1500.00,
      "tipo": "ENTRADA",
      "status": "OK",
      "categoria": {
        "id": 5,
        "nome": "Recebimento de Clientes",
        "icone": "💰"
      },
      "saldo_linha": 15000.00
    }
  ],
  "saldo_inicial": 13500.00,
  "saldo_final": 15000.00
}
```

---

#### `GET /api/banco/extrato/meses`
Lista meses disponíveis com lançamentos

**Query Parameters:**
- `empresa` - Código da empresa (obrigatório)

**Response:**
```json
{
  "sucesso": true,
  "meses": [
    {
      "ano": 2026,
      "mes": 9,
      "mes_nome": "Setembro",
      "total_lancamentos": 45,
      "total_entrada": 25000.00,
      "total_saida": 18000.00
    }
  ]
}
```

---

#### `POST /api/banco/extrato/gerar-pdf`
Gera PDF do extrato bancário

**Body:**
```json
{
  "empresa": "ALLMAX",
  "ano": 2026,
  "mes": 9,
  "filtros": {
    "status": "OK",
    "tipo": "ENTRADA"
  }
}
```

**Response:**
```json
{
  "sucesso": true,
  "url": "https://calendario-boat-production.up.railway.app/pdfs/extrato_ALLMAX_202609.pdf",
  "tamanho_kb": 245,
  "paginas": 3
}
```

---

## ✏️ **3. EDIÇÃO DE LANÇAMENTOS**

#### `GET /api/banco/categorias`
Lista todas as categorias disponíveis

**Response:**
```json
{
  "sucesso": true,
  "categorias": [
    {
      "id": 1,
      "nome": "Recebimento de Clientes",
      "icone": "💰",
      "cor": "#28a745",
      "tipo": "ENTRADA"
    },
    {
      "id": 2,
      "nome": "Despesas Operacionais",
      "icone": "🔧",
      "cor": "#dc3545",
      "tipo": "SAIDA"
    }
  ]
}
```

---

#### `GET /api/banco/lancamento/:id`
Busca um lançamento específico

**Response:**
```json
{
  "sucesso": true,
  "lancamento": {
    "id": 1234,
    "empresa": "ALLMAX",
    "data": "2026-09-14",
    "descricao": "PIX - João Silva",
    "descricao_original": "PIX REC JOAO SILVA",
    "valor": 1500.00,
    "tipo": "ENTRADA",
    "status": "OK",
    "categoria": {
      "id": 5,
      "nome": "Recebimento de Clientes"
    },
    "observacoes": "Cliente regular - pagamento adiantado",
    "recibos_urls": [
      "https://blob.vercel.app/recibo1.pdf"
    ]
  }
}
```

---

#### `PUT /api/banco/lancamento/:id`
Atualiza um lançamento

**Body:**
```json
{
  "categoria_id": 5,
  "descricao": "PIX - João Silva - Pagamento Setembro",
  "observacoes": "Cliente regular"
}
```

**Response:**
```json
{
  "sucesso": true,
  "lancamento": { ... }
}
```

---

## 🧾 **4. GESTÃO DE RECIBOS**

#### `GET /api/banco/recibos/listar`
Lista recibos disponíveis

**Query Parameters:**
- `empresa` - Código da empresa
- `data_inicio` - Data inicial
- `data_fim` - Data final

---

#### `GET /api/banco/recibos/empresas`
Lista empresas com recibos

**Response:**
```json
{
  "sucesso": true,
  "empresas": [
    {
      "codigo": "ALLMAX",
      "nome": "Allmax Transportes",
      "total_recibos": 145
    }
  ]
}
```

---

#### `DELETE /api/banco/recibos/excluir/:id`
Exclui TODOS os recibos de um lançamento

**Response:**
```json
{
  "sucesso": true,
  "arquivos_excluidos": 3,
  "bytes_liberados": 1245678
}
```

---

#### `POST /api/banco/recibos/excluir/lote`
Exclui recibos em lote (até 50 lançamentos)

**Body:**
```json
{
  "lancamento_ids": [123, 456, 789]
}
```

**Response:**
```json
{
  "sucesso": true,
  "total_lancamentos": 3,
  "total_arquivos_excluidos": 8,
  "bytes_liberados": 3456789
}
```

---

#### `DELETE /api/banco/recibos/excluir/:id/arquivo/:nome`
Exclui um arquivo específico de recibo

**Params:**
- `id` - ID do lançamento
- `nome` - Nome do arquivo (ex: recibo1.pdf)

---

## 💾 **5. BACKUPS AUTOMÁTICOS**

#### `POST /api/banco/backup/diario`
Gera backup manual diário

**Response:**
```json
{
  "sucesso": true,
  "timestamp": "2026-09-14T17:45:00-03:00",
  "arquivos": [
    {
      "tipo": "completo",
      "url": "https://blob.vercel.app/backups/diario/completo_20260914.sql",
      "tamanho_kb": 15678
    },
    {
      "tipo": "bank_tables",
      "url": "https://blob.vercel.app/backups/diario/bank_20260914.sql",
      "tamanho_kb": 8945
    }
  ]
}
```

---

#### `POST /api/banco/backup/semanal`
Gera backup manual semanal

---

#### `GET /api/banco/backup/listar/:tipo`
Lista backups disponíveis

**Params:**
- `tipo` - Tipo do backup (diario, semanal)

**Response:**
```json
{
  "sucesso": true,
  "backups": [
    {
      "data": "2026-09-14",
      "hora": "02:00",
      "url": "https://blob.vercel.app/backups/diario/...",
      "tamanho_kb": 15678
    }
  ]
}
```

---

#### `GET /api/banco/backup/baixar?url=...`
Baixa um backup específico

**Query Parameters:**
- `url` - URL do backup (obtida via /listar)

---

## 🔑 **6. TOKENS DE ARQUIVO**

#### `POST /api/banco/tokens/gerar`
Gera token de acesso temporário

**Body:**
```json
{
  "lancamento_ids": [123, 456],
  "validade_horas": 24,
  "empresa": "ALLMAX",
  "observacao": "Envio para auditoria"
}
```

**Response:**
```json
{
  "sucesso": true,
  "token": "abc123def456",
  "url_visualizador": "https://calendario-boat-production.up.railway.app/visualizador/abc123def456",
  "valido_ate": "2026-09-15T17:00:00-03:00"
}
```

---

#### `GET /api/banco/tokens/info/:token`
Informações sobre um token

**Response:**
```json
{
  "sucesso": true,
  "token": {
    "id": "abc123def456",
    "empresa": "ALLMAX",
    "lancamento_ids": [123, 456],
    "criado_em": "2026-09-14T17:00:00-03:00",
    "valido_ate": "2026-09-15T17:00:00-03:00",
    "ativo": true
  }
}
```

---

#### `GET /api/banco/tokens/arquivos/:token/:lancamento_id`
Lista arquivos acessíveis por um token

---

#### `DELETE /api/banco/tokens/revogar/:token`
Revoga um token (torna inválido)

---

## 🔧 **7. FERRAMENTAS ADMINISTRATIVAS**

#### `POST /api/banco/enriquecer`
Enriquece dados bancários (busca cliente e CR automaticamente)

**Body:**
```json
{
  "lancamento_ids": [123, 456, 789]
}
```

**Response:**
```json
{
  "sucesso": true,
  "processados": 3,
  "enriquecidos": 2,
  "nao_encontrados": 1
}
```

---

#### `POST /api/banco/reclassificar`
Reclassifica lançamentos por palavras-chave

**Body:**
```json
{
  "palavra_chave": "PIX REC",
  "categoria_id": 5,
  "empresa": "ALLMAX",
  "data_inicio": "2026-09-01",
  "data_fim": "2026-09-30"
}
```

**Response:**
```json
{
  "sucesso": true,
  "reclassificados": 15,
  "lancamentos": [123, 456, 789, ...]
}
```

---

## 📱 **8. WHATSAPP BOT**

#### `POST /msg_externa`
Recebe mensagens externas (usado pelo Vercel para retornos)

**Body:**
```json
{
  "numero": "5549999999999",
  "mensagem": "rrr...",
  "tipo": "retorno"
}
```

---

### **Comandos WhatsApp**

Os seguintes comandos são reconhecidos via mensagens no WhatsApp:

- `ccc...` - Solicitar calendário de uma embarcação
- `rrr...` - Registrar retorno de embarcação
- `ppp...` - Consultar previsão do tempo
- `hora motor` - Consultar/registrar horas de motor
- `saída` - Registrar saída de colaborador
- `admin` - Comandos administrativos (grupos ADM)
- `lll` - Sistema de aprendizado de classificação bancária

---

## 🌐 **9. PÁGINAS HTML PÚBLICAS**

Acessíveis diretamente via navegador:

- `/` - Página inicial
- `/extrato_bancario.html` - Interface do extrato bancário completo
- `/painel_admin.html` - **NOVO!** Painel administrativo com todos os endpoints
- `/visualizador/:token` - Visualizador de arquivos por token

---

## 🏢 **EMPRESAS CONFIGURADAS**

- **ALLMAX** - Allmax Transportes (Asaas + Sicredi)
- **IMOBEM** - Imobem Imóveis (Asaas + Sicredi)
- **IMOBAN** - Imoban Imóveis (Sicredi)
- **SUMMER** - Summer Max (Asaas + Sicredi)

---

## 🔄 **SINCRONIZAÇÃO AUTOMÁTICA**

- **Asaas:** Tempo real via webhook
- **Sicredi:** A cada 6 horas (00:00, 06:00, 12:00, 18:00 GMT-3)

---

## 💾 **BACKUPS AUTOMÁTICOS**

- **Diário:** Todo dia às 02:00 (GMT-3)
- **Semanal:** Sábado às 03:00 (GMT-3)
- **Armazenamento:** Vercel Blob Storage
- **Retenção:** 30 dias (diário), 90 dias (semanal)

---

## 🔐 **AUTENTICAÇÃO**

Atualmente não há autenticação implementada. **Recomenda-se implementar:**
- JWT para APIs sensíveis
- API Keys para webhooks
- Rate limiting

---

## 📊 **EXEMPLOS DE USO**

### Listar extrato do mês atual
```bash
curl "https://calendario-boat-production.up.railway.app/api/banco/extrato/listar?empresa=ALLMAX&ano=2026&mes=9"
```

### Sincronizar Sicredi manualmente
```bash
curl -X POST "https://calendario-boat-production.up.railway.app/api/banco/sicredi/sync"
```

### Gerar backup diário
```bash
curl -X POST "https://calendario-boat-production.up.railway.app/api/banco/backup/diario"
```

### Ver status do sistema
```bash
curl "https://calendario-boat-production.up.railway.app/api/banco/status"
```

---

## 📝 **NOTAS**

- Todas as datas e horários usam fuso **America/Sao_Paulo (GMT-3)**
- Valores monetários em **BRL (R$)**
- Encoding: **UTF-8**
- Formato de data: **YYYY-MM-DD** ou **DD/MM/YYYY**
- Formato de hora: **HH:mm:ss**

---

**Última atualização:** 14/09/2026 18:00  
**Documentação gerada por:** Claude Sonnet 4.5  
**Versão:** V.2609141800

<!-- V.2609141800 -->