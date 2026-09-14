# Sistema de Geolocalização 70m

**Status:** ⛔ DESABILITADO (14/09/2026)  
**Motivo:** Verificação inócua (não está sendo usada)  
**Decisão:** Até segunda ordem

---

## 📋 O QUE É

Sistema automático de confirmação de retorno de embarcações baseado em geolocalização.

**Funcionalidade:**
- Rastreia posições de embarcações em tempo real
- Quando embarcação entra na zona de 70m da marina
- Envia pergunta automática no WhatsApp: "Confirma retorno? S/N"
- Se confirmar (S) → Registra retorno automaticamente
- Se negar (N) → Aguarda 5 minutos e pergunta novamente

---

## 🗂️ ARQUIVOS ENVOLVIDOS

| Arquivo | Função |
|---------|--------|
| `wpp/server.js` | Handler principal + verificações |
| `wpp/localizacao.js` | Lógica de geolocalização |
| `integracao_tile_life360.js` | Integração com Life360 |

---

## ❌ O QUE FOI DESABILITADO

### **1. Import (linha ~62)**
```javascript
// ANTES
import { handleLocalizacao, verificarPosicoesExpiradas, 
         verificarPosicoes70Metros, enviarPerguntaConfirmacao70m, 
         buscarRankingAtual, atualizarRankingEmTodosGrupos } from './localizacao.js'

// DEPOIS (comentado)
// GEOLOCALIZAÇÃO DESABILITADA (14/09/2026) - Até segunda ordem
// import { ... } from './localizacao.js'
```

### **2. Map de Estado (linha ~91)**
```javascript
// ANTES
const aguardandoConfirmacao70m = new Map()

// DEPOIS (comentado)
// const aguardandoConfirmacao70m = new Map()
```

### **3. Função Handler (linha ~151)**
```javascript
// ANTES
async function handleConfirmacao70m(sock, pool, grupoId, texto, remetente) {
  // ... código completo
}

// DEPOIS (comentado)
/*
async function handleConfirmacao70m(...) {
  // código comentado
}
*/
```

### **4. Verificação no Handler (linha ~398)**
```javascript
// ANTES
if (aguardandoConfirmacao70m.has(grupoId)) {
  const respondeu = await handleConfirmacao70m(sock, pool, grupoId, texto, remetente)
  if (respondeu) continue
}

// DEPOIS (comentado)
/*
if (aguardandoConfirmacao70m.has(grupoId)) {
  // código comentado
}
*/
```

### **5. SetInterval de Verificação (linha ~1292)**
```javascript
// ANTES
setInterval(async () => {
  if (!conectado || !sock) return
  try {
    await verificarPosicoes70Metros(sock, pool, aguardandoConfirmacao70m)
  } catch (erro) {
    console.error('❌ Erro na verificação 70m:', erro)
  }
}, 5 * 60 * 1000) // 5 minutos

// DEPOIS (comentado)
/*
setInterval(async () => {
  // código comentado
}, 5 * 60 * 1000)
*/
```

---

## ♻️ COMO REATIVAR

**Passo a passo:**

1. Abrir `wpp/server.js`

2. Buscar por: `DESABILITADO (14/09/2026)`

3. Descomentar TODOS os blocos encontrados:
   - Remover `//` das linhas únicas
   - Remover `/*` e `*/` dos blocos de código

4. Commit e deploy:
```bash
git add wpp/server.js
git commit -m "feat(geo): reativar sistema de geolocalização 70m"
git push origin main
```

5. Verificar logs do Railway:
```
✅ [70m] Verificando barcos na zona de confirmação...
```

---

## 🔍 LOGS QUANDO ATIVO

**Verificação periódica (a cada 5 min):**
```
✅ [70m] Verificando barcos na zona de confirmação...
   ✅ Nenhum barco na zona 70m
```

**Quando detecta barco < 70m:**
```
📍 [70m] Barco PB-123 detectado a 45m
📱 Enviando pergunta de confirmação...
```

**Mensagem WhatsApp:**
```
📍 RETORNO DETECTADO

Embarcação PB-123 está a menos de 70m!
Deseja confirmar o retorno?

S - SIM
N - NÃO (aguarda 5 min)

Sistema 70m
```

---

## 📊 FLUXO COMPLETO

```
1. setInterval (5 min)
   ↓
2. verificarPosicoes70Metros()
   ↓
3. Busca embarcações em saída sem retorno
   ↓
4. Verifica geolocalização (Life360)
   ↓
5. Distância < 70m?
   ├─ NÃO → Aguarda próxima verificação
   └─ SIM → Envia pergunta WhatsApp
       ↓
6. aguardandoConfirmacao70m.set(grupoId, {data})
   ↓
7. Aguarda resposta S/N
   ├─ S → Registra retorno (UPDATE Dt_Retorno)
   ├─ N → aguarda 5 min, nova pergunta
   └─ Timeout → reenviar pergunta
```

---

## 🗄️ BANCO DE DADOS

**Tabela:** `public."P_BOAT_z_10_Saida_Emb"`

**Campos usados:**
- `ID` - Identificador do agendamento
- `PB` - Sigla da embarcação
- `Cota` - Número da cota
- `Dt_Saida` - Data/hora da saída
- `Dt_Retorno` - Data/hora do retorno (NULL = ainda em saída)

**Query de retorno:**
```sql
UPDATE public."P_BOAT_z_10_Saida_Emb"
SET "Dt_Retorno" = NOW() AT TIME ZONE 'America/Sao_Paulo'
WHERE "ID" = $1
```

---

## 🔧 DEPENDÊNCIAS

- **Life360 API** - Rastreamento GPS
- **WhatsApp Bot** - Envio de mensagens
- **PostgreSQL** - Registro de retornos

---

## 📝 NOTAS

- Sistema funciona 24/7 (verificação a cada 5 minutos)
- Apenas colaboradores cadastrados podem confirmar
- Pergunta persiste até resposta S/N
- Útil para automatizar confirmações de retorno

---

**Última atualização:** 14/09/2026 00:53  
**Commit:** 9e56de2  
**Por:** Claude Sonnet 4.5
