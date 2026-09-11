# 📱 COMO PEGAR IDs DOS GRUPOS FINANCEIROS
**V.260911212000**

---

## 🎯 OBJETIVO

Precisamos dos IDs dos 4 grupos WhatsApp financeiros:
- 📊 Financeiro ALLMAX
- 📊 Financeiro IMOBEM
- 📊 Financeiro IMOBAN
- 📊 Financeiro SUMMER

---

## 📋 MÉTODO 1: Endpoint `/grupos` (MAIS FÁCIL)

### **Passo a passo:**

1. **Aguarde o Railway estar no ar:**
   ```
   https://calendario-boat-production.up.railway.app/status
   ```
   Deve mostrar: `"whatsappConectado": true`

2. **Acesse o endpoint de grupos:**
   ```
   https://calendario-boat-production.up.railway.app/grupos
   ```

3. **Procure pelos grupos financeiros:**
   ```json
   [
     {
       "nome": "Financeiro ALLMAX",
       "id": "120363424805097946@g.us",
       "participantes": 15
     },
     {
       "nome": "Lançamentos SUMMER",
       "id": "120363330197701730@g.us",
       "participantes": 8
     },
     ...
   ]
   ```

4. **Copie os IDs** e anote em algum lugar

---

## 📋 MÉTODO 2: Mandar Mensagem e Ver Logs

### **Passo a passo:**

1. **Entre em cada grupo financeiro no WhatsApp**

2. **Mande uma mensagem qualquer:**
   ```
   teste
   ```

3. **Vá nos logs do Railway:**
   - Dashboard Railway → calendario-boat → Production
   - Aba **"Deployments"**
   - Último deploy → **"View Logs"**

4. **Procure por linhas como:**
   ```
   Grupo ID: 120363424805097946@g.us
   ```

5. **Anote os IDs**

---

## 📋 MÉTODO 3: Código Temporário (AVANÇADO)

Se os métodos acima não funcionarem, adicione este código temporário:

### **1. Editar `wpp/server.js`**

Na linha **~293** (dentro do `sock.ev.on('messages.upsert', ...)`), adicione:

```javascript
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    const grupoId = msg.key.remoteJid;

    // CÓDIGO TEMPORÁRIO - MOSTRAR ID DE GRUPOS FINANCEIROS
    if (grupoId?.endsWith('@g.us')) {
      try {
        const metadata = await sock.groupMetadata(grupoId);
        const nomeGrupo = metadata.subject;

        if (nomeGrupo.toLowerCase().includes('financeiro') ||
            nomeGrupo.toLowerCase().includes('lançamento')) {

          console.log('\n' + '='.repeat(60));
          console.log('💰 GRUPO FINANCEIRO:');
          console.log('   Nome:', nomeGrupo);
          console.log('   ID:', grupoId);
          console.log('='.repeat(60) + '\n');
        }
      } catch (err) {}
    }

    // ... resto do código (não mexer)
  }
});
```

### **2. Fazer deploy**

```bash
git add wpp/server.js
git commit -m "temp: Adicionar log de IDs de grupos"
git push origin dev
```

### **3. Mandar mensagem em cada grupo**

### **4. Ver logs no Railway**

Procure por:
```
============================================================
💰 GRUPO FINANCEIRO:
   Nome: Financeiro ALLMAX
   ID: 120363424805097946@g.us
============================================================
```

### **5. REMOVER O CÓDIGO** depois de anotar os IDs!

---

## 📝 ANOTAR OS IDs

Use esta tabela:

| Empresa | Nome do Grupo | ID do Grupo |
|---------|---------------|-------------|
| **ALLMAX** | Financeiro ALLMAX | `_____________________@g.us` |
| **IMOBEM** | Financeiro IMOBEM | `_____________________@g.us` |
| **IMOBAN** | Financeiro IMOBAN | `_____________________@g.us` |
| **SUMMER** | Financeiro SUMMER | `_____________________@g.us` |

---

## 🔧 DEPOIS DE PEGAR OS IDs

### **Atualizar o arquivo de configuração:**

Edite: `wpp/config/grupos-financeiros.js`

```javascript
export const GRUPOS_FINANCEIROS = {
  'ALLMAX': '120363424805097946@g.us',  // ← Cole o ID real aqui
  'IMOBEM': '120363XXXXXXXXXXX@g.us',   // ← Cole o ID real aqui
  'IMOBAN': '120363XXXXXXXXXXX@g.us',   // ← Cole o ID real aqui
  'SUMMER': '120363330197701730@g.us'   // ← Cole o ID real aqui
};
```

### **OU adicionar como variáveis de ambiente no Railway:**

```
GRUPO_FINANCEIRO_ALLMAX=120363424805097946@g.us
GRUPO_FINANCEIRO_IMOBEM=120363XXXXXXXXXXX@g.us
GRUPO_FINANCEIRO_IMOBAN=120363XXXXXXXXXXX@g.us
GRUPO_FINANCEIRO_SUMMER=120363330197701730@g.us
```

---

## ✅ VALIDAR CONFIGURAÇÃO

Depois de configurar, você pode validar programaticamente:

```javascript
import { validarConfiguracao } from './config/grupos-financeiros.js';

const validacao = validarConfiguracao();

if (validacao.valido) {
  console.log('✅ Todos os grupos configurados!');
} else {
  console.log('❌ Faltam grupos:', validacao.faltando);
  console.log(`   Configurados: ${validacao.configurados}/${validacao.total}`);
}
```

---

## 🎯 PRÓXIMO PASSO

Depois de ter os IDs:
1. Atualizar `wpp/config/grupos-financeiros.js`
2. Fazer commit e push
3. Testar enviando mensagem em cada grupo

---

**V.260911212000**
