# 🔄 RECLASSIFICADOR AUTOMÁTICO POR PALAVRAS-CHAVE

## 📋 O QUE FAZ

Reaplicar regras de classificação automática quando você:
- ✅ Adicionar novas palavras-chave na tabela `bank_regras_classificacao`
- ✅ Criar novas regras de classificação
- ✅ Modificar regras existentes
- ✅ Quiser reclassificar registros antigos

## 🚀 COMO USAR

### 1. CONFIGURAR (editar o arquivo)

Abra `reclassificar_palavras_chave.js` e ajuste:

```javascript
const CONFIG = {
  // Filtros
  empresa: 'ALLMAX',              // null = todas
  banco: 'Asaas',                 // null = todos

  // Modo
  modo: 'NAO_CLASSIFICADOS',      // ou 'TODOS'

  // Período (opcional)
  dataInicio: null,               // '2026-09-01' ou null
  dataFim: null,                  // '2026-09-30' ou null

  // Opções
  sobrescrever: false,            // true = reclassifica mesmo os já OK
  atualizarStatus: true           // true = marca como 'OK'
};
```

### 2. EXECUTAR

```bash
node wpp/routes/banco/reclassificar_palavras_chave.js
```

## 📊 MODOS DE OPERAÇÃO

### Modo 1: NAO_CLASSIFICADOS (padrão)
```javascript
modo: 'NAO_CLASSIFICADOS'
```
- Reclassifica apenas registros **SEM classificação** ou com **status != 'OK'**
- ✅ Mais seguro
- ✅ Não sobrescreve classificações manuais

### Modo 2: TODOS
```javascript
modo: 'TODOS'
```
- Processa **TODOS** os registros (mesmo os já classificados)
- Se `sobrescrever: false` → mantém classificações existentes
- Se `sobrescrever: true` → **SUBSTITUI** todas as classificações

## ⚙️ OPÇÕES AVANÇADAS

### Filtrar por Período
```javascript
dataInicio: '2026-09-01',
dataFim: '2026-09-30'
```

### Sobrescrever Classificações Existentes
```javascript
sobrescrever: true  // ⚠️ CUIDADO! Substitui tudo
```

### Apenas Classificar (sem mudar status)
```javascript
atualizarStatus: false  // Classifica mas não marca como OK
```

## 📋 EXEMPLOS DE USO

### Exemplo 1: Reclassificar apenas não classificados
```javascript
const CONFIG = {
  empresa: 'ALLMAX',
  banco: 'Asaas',
  modo: 'NAO_CLASSIFICADOS',
  dataInicio: null,
  dataFim: null,
  sobrescrever: false,
  atualizarStatus: true
};
```

### Exemplo 2: Reclassificar setembro/2026 completo
```javascript
const CONFIG = {
  empresa: 'ALLMAX',
  banco: 'Asaas',
  modo: 'TODOS',
  dataInicio: '2026-09-01',
  dataFim: '2026-09-30',
  sobrescrever: true,
  atualizarStatus: true
};
```

### Exemplo 3: Aplicar novas regras sem sobrescrever
```javascript
const CONFIG = {
  empresa: 'ALLMAX',
  banco: 'Asaas',
  modo: 'TODOS',
  dataInicio: null,
  dataFim: null,
  sobrescrever: false,  // ← NÃO sobrescreve
  atualizarStatus: true
};
```

## 📊 RELATÓRIO GERADO

O script mostra:
```
📊 RELATÓRIO FINAL:

  Total processados: 215
  ✅ Reclassificados: 87
  ⏭️  Mantidos (já classificados): 25
  ⚠️  Sem regra aplicável: 103
  ❌ Erros: 0

📋 RECLASSIFICADOS POR REGRA:

  Mensalidade                               :   45 registros
  Venda Cota                                :   23 registros
  Combustível                               :   12 registros
  Taxa Bancária                             :    7 registros
```

## 🔄 WORKFLOW RECOMENDADO

1. **Adicionar novas palavras-chave** na tabela `bank_regras_classificacao`
   
2. **Executar o reclassificador** com modo `NAO_CLASSIFICADOS`
   ```bash
   node wpp/routes/banco/reclassificar_palavras_chave.js
   ```

3. **Verificar o relatório** e ajustar regras se necessário

4. **Repetir** até todas as categorias estarem cobertas

## ⚠️ AVISOS

- ✅ Sempre teste primeiro com `sobrescrever: false`
- ✅ Use filtros de período para testar em pequenos lotes
- ⚠️ `sobrescrever: true` + `modo: 'TODOS'` = **SUBSTITUI TUDO**
- 💾 Faça backup antes de rodar com sobrescrever ativo

## 🎯 BOTÃO DE AJUSTE

Este script funciona como um **"botão de ajuste"**:
- Adicione novas regras → Execute o script → Pronto!
- Modificou palavras → Execute o script → Pronto!
- Importou novos dados → Execute o script → Pronto!
