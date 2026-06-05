# 🏷️ SETUP COMPLETO: TILE LIFE360

## V.2606041605

---

## 📦 **PASSO 1: COMPRAR O PRODUTO**

Link Mercado Livre:
```
https://www.mercadolivre.com.br/pacote-com-2-monitores-bluetooth-tile-life360-mate/up/MLBU3287886028
```

**Produto:** Tile Mate by Life360 (Pack com 2)  
**Preço:** R$ 250-350  
**Origem:** Uruguai

---

## 📱 **PASSO 2: CONFIGURAR LIFE360**

### **2.1 Criar conta Life360:**

1. Baixe o app:
   - iOS: https://apps.apple.com/app/life360/id384830320
   - Android: https://play.google.com/store/apps/details?id=com.life360.android.safetymapd

2. Crie conta com email profissional (ex: allmaxtotal@gmail.com)

3. Crie um "Círculo" (família):
   - Nome: "Allmax Embarcações"

### **2.2 Adicionar Tiles ao Life360:**

1. Abra app Life360
2. Menu → "Adicionar Tile"
3. Siga instruções para parear cada Tile
4. Nomeie os Tiles:
   - "Emb 151"
   - "Emb 573"
   - etc.

5. Anote os IDs dos Tiles:
   - Life360 app → Tile → Configurações → ID

---

## 💻 **PASSO 3: CONFIGURAR BACKEND**

### **3.1 Criar tabelas no PostgreSQL:**

```sql
-- Execute no Neon Database

-- Tabela de rastreamento Tiles
CREATE TABLE IF NOT EXISTS rastreamento_tiles (
  tile_id VARCHAR(100) PRIMARY KEY,
  embarcacao_pb INTEGER REFERENCES "P_BOAT_1_Embarcacao"("Num_PB"),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  timestamp TIMESTAMP WITH TIME ZONE,
  accuracy DECIMAL(8, 2),
  battery INTEGER,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de confirmações 70m
CREATE TABLE IF NOT EXISTS confirmacoes_70m (
  id SERIAL PRIMARY KEY,
  agendamento_id INTEGER REFERENCES "P_BOAT_z_10_Saida_Emb"("ID"),
  tile_id VARCHAR(100),
  distancia DECIMAL(8, 2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tiles_embarcacao
  ON rastreamento_tiles(embarcacao_pb);

CREATE INDEX IF NOT EXISTS idx_confirmacoes_agendamento
  ON confirmacoes_70m(agendamento_id, timestamp DESC);

-- Inserir Tiles iniciais (EXEMPLO - ajuste os IDs reais)
INSERT INTO rastreamento_tiles (tile_id, embarcacao_pb, ativo)
VALUES
  ('tile-abc123', 151, true),  -- Substituir por ID real
  ('tile-xyz789', 573, true);  -- Substituir por ID real
```

### **3.2 Configurar variáveis de ambiente:**

No Railway ou local (`.env`):

```bash
# Credenciais Life360
LIFE360_EMAIL=allmaxtotal@gmail.com
LIFE360_PASSWORD=SuaSenhaAqui123
```

### **3.3 Instalar dependência:**

```bash
cd C:\Users\NOTEBOOK\projetos\calendario_allmax
npm install node-fetch
```

### **3.4 Integrar ao server.js:**

Adicione no `wpp/server.js`:

```javascript
// No topo do arquivo (imports)
import { iniciarRastreamentoTiles } from '../integracao_tile_life360.js'

// Após WhatsApp conectar (linha ~250)
sock.ev.on('connection.update', async (update) => {
  const { connection } = update

  if (connection === 'open') {
    console.log('✅ WhatsApp conectado!')
    conectado = true

    // ADICIONAR AQUI:
    if (IS_PRODUCTION) {
      await iniciarRastreamentoTiles(sock)
    }
  }
})
```

---

## 🧪 **PASSO 4: TESTAR**

### **4.1 Teste manual (via Node.js):**

Crie arquivo `test_tile.js`:

```javascript
import { iniciarRastreamentoTiles } from './integracao_tile_life360.js'

// Mock do sock (apenas para teste)
const mockSock = {
  sendMessage: async (id, msg) => {
    console.log(`📤 Enviar para ${id}:`, msg.text)
  }
}

await iniciarRastreamentoTiles(mockSock)
```

Execute:
```bash
node test_tile.js
```

Resultado esperado:
```
🔐 Fazendo login no Life360...
✅ Login Life360 bem-sucedido
📍 Círculo Life360: Allmax Embarcações
🔄 Iniciando verificação de Tiles...
📍 2 Tiles para verificar
📍 Tile tile-abc123: -10.212911, -48.392500
💾 Localização salva: Tile tile-abc123
📏 Distância da marina: 15.2m
🎯 EMBARCAÇÃO DENTRO DOS 70M!
✅ Verificação concluída
```

### **4.2 Teste em produção:**

1. Deploy no Railway
2. Aguarde 5 minutos (primeira verificação)
3. Verifique logs:
   ```
   railway logs
   ```

---

## 📊 **PASSO 5: MONITORAR**

### **5.1 Verificar localizações no banco:**

```sql
SELECT
  tile_id,
  embarcacao_pb,
  latitude,
  longitude,
  timestamp,
  AGE(NOW(), timestamp) as ultima_atualizacao
FROM rastreamento_tiles
ORDER BY timestamp DESC;
```

### **5.2 Verificar confirmações 70m:**

```sql
SELECT
  c.*,
  e."Nome_Embar"
FROM confirmacoes_70m c
JOIN "P_BOAT_z_10_Saida_Emb" s ON c.agendamento_id = s."ID"
JOIN "P_BOAT_1_Embarcacao" e ON s."Cod_Emb_PB" = e."Num_PB"
ORDER BY c.timestamp DESC
LIMIT 10;
```

### **5.3 Dashboard simples (opcional):**

```sql
-- Frequência de atualização por Tile
SELECT
  rt.tile_id,
  e."Nome_Embar",
  COUNT(*) as total_updates,
  MIN(AGE(NOW(), rt.timestamp)) as ultima_atualizacao,
  AVG(EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (PARTITION BY tile_id ORDER BY timestamp)))) / 60 as intervalo_medio_min
FROM rastreamento_tiles rt
JOIN "P_BOAT_1_Embarcacao" e ON rt.embarcacao_pb = e."Num_PB"
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY rt.tile_id, e."Nome_Embar"
ORDER BY ultima_atualizacao;
```

---

## ✅ **CHECKLIST DE VALIDAÇÃO:**

Após 7 dias de teste, valide:

```
□ Tiles atualizam a cada 5-15 minutos?
□ Precisão < 50 metros?
□ Sistema 70m detecta corretamente?
□ Alertas WhatsApp funcionando?
□ Bateria dos Tiles OK?
□ Sem falsos positivos?

SE SIM ✅ → Escalar para mais embarcações
SE NÃO ❌ → Avaliar Tile Pro ou GPS 4G
```

---

## 🆘 **TROUBLESHOOTING:**

### **Problema: "Erro no login Life360"**
```
Solução:
1. Verificar email/senha corretos
2. Tentar login manual no app
3. Verificar se conta não está bloqueada
4. Trocar senha e atualizar .env
```

### **Problema: "Nenhum círculo Life360 encontrado"**
```
Solução:
1. Abrir app Life360
2. Criar círculo manualmente
3. Adicionar pelo menos 1 Tile ao círculo
```

### **Problema: "Tile sem localização recente"**
```
Causas possíveis:
1. Tile fora de alcance (76m) de qualquer celular
2. Tile com bateria baixa
3. Tile não pareado corretamente

Soluções:
1. Levar embarcação para área com celulares
2. Verificar bateria no app
3. Re-parear Tile no app
```

### **Problema: "Token Life360 expirado"**
```
Solução:
O código faz re-login automático.
Se persistir:
1. Gerar novo token manualmente
2. Verificar rate limit Life360 (10 req/min)
```

---

## 📈 **PRÓXIMOS PASSOS:**

### **Após validação bem-sucedida:**

1. **Comprar mais Tiles:**
   - 4 packs adicionais (8 Tiles)
   - Total: 10 embarcações cobertas

2. **Cadastrar no banco:**
   ```sql
   INSERT INTO rastreamento_tiles (tile_id, embarcacao_pb, ativo)
   VALUES
     ('tile-id-3', 184, true),
     ('tile-id-4', 292, true),
     -- ... mais 6
   ```

3. **Criar painel web (opcional):**
   - Mapa com posição em tempo real
   - Histórico de movimentação
   - Alertas de proximidade

4. **Integrar com app:**
   - Botão "Ver Localização" no calendário
   - Notificações push de retorno
   - Histórico de trajetos

---

## 💰 **CUSTOS TOTAIS:**

```
Investimento inicial: R$ 1.250
├─ 5 packs Tile Mate (10 unidades)
└─ Frete

Custo mensal: R$ 0
├─ Sem mensalidade
└─ Bateria dura 3 anos

Custo após 3 anos: R$ 1.250 (trocar todos)
└─ Bateria selada = descarta e compra novos
```

---

## 📞 **SUPORTE:**

Dúvidas técnicas:
- Email: allmaxtotal@gmail.com
- WhatsApp: (seu número)

Suporte Life360:
- https://support.life360.com
- help@life360.com

---

**🎉 Boa sorte com o teste! Me avise quando os Tiles chegarem para ajudar na configuração!**
