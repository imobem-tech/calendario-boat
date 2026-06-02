# 📍 Configuração do Sistema de Localização em Tempo Real

## V.2606021250

---

## ✅ O QUE FOI IMPLEMENTADO

### 1. **Localização em Tempo Real = Pedido de Retorno**
- Cliente compartilha localização ao vivo no grupo
- Bot entende como **barco em processo de retorno**
- **Grava TODAS as posições** recebidas no banco
- **Registra retorno VIA GEO** automaticamente quando chega no raio do pier (≤ 150m)
- Envia mensagem diferenciada no grupo: **"RETORNO_XXXX VIA GEO"**

### 2. **Ranking Dinâmico em Tempo Real**
- Mensagem de ranking atualizada **a cada nova localização**
- Mostra em **todos os grupos** que enviaram localização + ESPELHO_RETORNO
- Ordenado por distância do pier (menor = 1º lugar)
- **Renovação automática a cada 12min** (antes do limite de 15min do WhatsApp)
- Layout com emojis por distância: 🟢 até 300m | 🟡 até 1km | 🔴 > 1km | ⚪ sem localização

### 3. **Página de Rastreamento Público**
- **Google Maps em modo satélite**
- Todas embarcações em tempo real
- Atualiza a cada 5 segundos
- Link no rodapé do ranking: `https://allmaxcalendar.vercel.app/rastrear`

### 4. **Comando rrr MANTIDO**
- Funciona **em paralelo** com localização
- Cliente pode usar rrr OU localização
- rrr = confirmação manual S/N
- Localização = automático VIA GEO

---

## 🔧 CONFIGURAÇÃO OBRIGATÓRIA

### **1. Executar SQL no Neon PostgreSQL**

Acesse o console do Neon e execute:

```bash
C:\Users\NOTEBOOK\projetos\calendario_allmax\sql\wpp_localizacao_tabelas.sql
```

Ou copie e cole o conteúdo diretamente no Neon SQL Editor.

---

### **2. Definir Coordenadas do Porto**

**🎯 Como obter as coordenadas:**

1. Abra o Google Maps
2. Encontre o porto/marina
3. Clique direito no local exato
4. Clique em "Copiar coordenadas"
5. Você terá algo como: `-10.1832, -48.3336`

**📝 Onde configurar:**

#### **Arquivo 1:** `wpp/localizacao.js` (linha 14-15)

```javascript
const PORTO = {
  latitude: -10.1832,      // ← SUBSTITUIR pela coordenada real
  longitude: -48.3336,     // ← SUBSTITUIR pela coordenada real
  raioMetros: 150,         // Ajustar conforme necessário
  tempoParadoMs: 3 * 60 * 1000  // 3 minutos
}
```

#### **Arquivo 2:** `public/rastrear.html` (linha 51-52)

```javascript
const PORTO_LAT = -10.1832  // ← SUBSTITUIR pela coordenada real
const PORTO_LON = -48.3336  // ← SUBSTITUIR pela coordenada real
```

---

### **3. Confirmar ID do Grupo Espelho**

**📝 Arquivo:** `wpp/localizacao.js` (linha 18)

```javascript
const GRUPO_ESPELHO_RETORNO_ID = '120363426928542914@g.us'
```

✅ **Já está configurado** com o grupo correto (ESPELHO_RETORNO)

---

## 🚀 COMO TESTAR

### **Teste 1: Localização em Tempo Real**

1. Abra o WhatsApp no celular
2. Entre em um grupo de embarcação (ex: 151-Q1)
3. Certifique-se que tem uma **saída aberta** hoje
4. Clique em **📎 Anexar** → **📍 Localização**
5. Escolha **"Localização em tempo real"** (15min, 1h ou 8h)
6. Envie para o grupo

**✅ O que deve acontecer:**
- Bot recebe a localização
- Grava no banco
- Calcula distância do porto
- **Envia mensagem de ranking** no grupo e no ESPELHO_RETORNO
- Se você estiver perto do porto (< 150m) por 3 minutos: registra retorno automático

---

### **Teste 2: Página de Rastreamento**

1. Acesse: `http://localhost:8080/rastrear.html` (local)
2. Ou: `https://seudominio.com/rastrear.html` (produção)

**✅ O que deve aparecer:**
- Mapa com pin vermelho do porto
- Pins azuis das embarcações navegando
- Atualiza automaticamente a cada 5s

---

### **Teste 3: API de Rastreamento**

Acesse: `http://localhost:8080/rastrear`

**✅ Retorno esperado:**
```json
{
  "sucesso": true,
  "embarcacoes": [
    {
      "agendamento_id": 15574,
      "pb": 151,
      "cota": "Q1",
      "nome_autorizado": "FULANO DE TAL",
      "latitude": -10.1850,
      "longitude": -48.3340,
      "distancia_porto_m": 240,
      "ultima_atualizacao": "2026-06-02T12:45:30.123Z"
    }
  ],
  "timestamp": "2026-06-02T12:50:00.000Z"
}
```

---

## 📊 ESTRUTURA DO BANCO DE DADOS

### **Tabela: `wpp_localizacao_emb`**
Armazena cada posição recebida:
- `agendamento_id` - Vincula à saída
- `pb` / `cota` - Embarcação
- `latitude` / `longitude` - Coordenadas
- `distancia_porto_m` - Distância calculada
- `criado_em` - Timestamp

### **Tabela: `wpp_ranking_msg`**
Guarda messageKey para editar a mesma mensagem:
- `grupo_id` - ID do grupo WhatsApp
- `message_key` - Chave da mensagem para edição
- `atualizado_em` - Última atualização

---

## 🎯 AJUSTES FINOS

### **Raio de chegada (registro automático VIA GEO)**
```javascript
const RAIO_CHEGADA_METROS = 150  // 150 metros do pier
```
- Quando distância ≤ 150m → registra retorno VIA GEO automaticamente
- Ajustar conforme precisão GPS e tamanho da marina

### **Intervalo de atualização do mapa**
```javascript
const INTERVALO_ATUALIZACAO = 5000 // 5 segundos
```
- Menor = mais fluido, mas mais requisições ao servidor
- Maior = economiza banda, mas menos fluido

---

## 📝 CHECKLIST ANTES DE SUBIR

- [ ] SQL executado no Neon
- [ ] Coordenadas do porto configuradas em `localizacao.js`
- [ ] Coordenadas do porto configuradas em `rastrear.html`
- [ ] ID do grupo espelho confirmado
- [ ] Testado localmente com localização real
- [ ] Página `/rastrear` acessível

---

## 🚀 DEPLOY

Depois de configurar tudo, faça o commit:

```bash
git add .
git commit -m "feat: Sistema completo de localização em tempo real"
git push origin main
```

Railway e Vercel vão atualizar automaticamente.

---

## 🆘 TROUBLESHOOTING

### **Ranking não atualiza**
- Verifique se as tabelas foram criadas no banco
- Confira se o grupo tem saída aberta hoje
- Veja os logs do Railway para erros

### **Retorno não é registrado automaticamente**
- Verifique as coordenadas do porto (devem ser exatas)
- Ajuste `raioMetros` se necessário
- Cliente precisa ficar parado 3 minutos no raio

### **Mapa não carrega embarcações**
- Acesse `/rastrear` (API) para ver se retorna dados
- Verifique se tem localização gravada no banco
- Confira console do navegador para erros

---

**✅ Sistema pronto para uso!**

**V.2606021250**
