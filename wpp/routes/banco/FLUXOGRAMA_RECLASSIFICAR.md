# 🏷️ FLUXOGRAMA: BOTÃO RECLASSIFICAR

## 📊 VISÃO GERAL

```
┌─────────────────────────────────────────────────────────────┐
│            RECLASSIFICAÇÃO POR PALAVRAS-CHAVE               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ Usa bank_categorias (palavras_chave + chave_aprendida) │
│  ✅ Apenas não classificados (classificacao IS NULL OR '')  │
│  ✅ Respeita filtros: empresa + intervalo de datas         │
│  ✅ Mesma lógica do webhook do Asaas                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 FLUXO COMPLETO

```
USUÁRIO CLICA NO BOTÃO
  ↓
┌─────────────────────────────────────────────┐
│ 1. CAPTURAR FILTROS DO CABEÇALHO           │
├─────────────────────────────────────────────┤
│ • empresa = empresaSelect.value             │
│   → TODAS, ALLMAX, IMOBEM, IMOBAN, SUMMER  │
│                                             │
│ • Modo de data ativo:                       │
│   ├─ Por Mês:                               │
│   │  dataInicio = mes-01                    │
│   │  dataFim = mes-ultimoDia                │
│   │                                          │
│   └─ Por Intervalo:                         │
│      dataInicio = dataInicio.value          │
│      dataFim = dataFim.value                │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ 2. MONTAR MENSAGEM DE CONFIRMAÇÃO          │
├─────────────────────────────────────────────┤
│ 🏷️ Reclassificar extratos?                 │
│                                             │
│ Isso irá:                                   │
│ ✅ Aplicar regras aos NÃO classificados    │
│ ✅ Atualizar categorias                     │
│ ⚠️  Status permanece como está              │
│ 📍 Empresa: ALLMAX                          │
│ 📅 Período: 2026-09-01 a 2026-09-30        │
│                                             │
│ Deseja continuar?                           │
└─────────────────────────────────────────────┘
  ↓
  ├─── NÃO → CANCELAR
  │
  └─── SIM → CONTINUAR
        ↓
┌─────────────────────────────────────────────┐
│ 3. FRONTEND: ENVIAR REQUEST                │
├─────────────────────────────────────────────┤
│ POST /api/banco/reclassificar               │
│   ?empresa=ALLMAX                           │
│   &dataInicio=2026-09-01                    │
│   &dataFim=2026-09-30                       │
│                                             │
│ Botão: "⏳ Reclassificando..."             │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ 4. BACKEND: BUSCAR REGISTROS NÃO CLASSIF.  │
├─────────────────────────────────────────────┤
│ SELECT id, empresa, descricao_original,     │
│        observacoes, valor, tipo,            │
│        cpf_cnpj_origem                      │
│ FROM bank_extratos                          │
│ WHERE banco = 'Asaas'                       │
│   AND (classificacao IS NULL OR = '')       │
│   [AND empresa = 'ALLMAX']     ← opcional   │
│   [AND data BETWEEN ...]       ← opcional   │
│ ORDER BY data, id                           │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ 5. INICIALIZAR ESTATÍSTICAS                │
├─────────────────────────────────────────────┤
│ stats = {                                   │
│   analisados: 0,                            │
│   semTexto: 0,                              │
│   semRegra: 0,                              │
│   classificados: 0,                         │
│   naoClassificados: 0,                      │
│   erros: 0                                  │
│ }                                           │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ 6. PARA CADA REGISTRO...                   │
└─────────────────────────────────────────────┘
  ↓
  │ ┌───────────────────────────────────────┐
  │ │ 6.1. TEM TEXTO?                       │
  │ └───────────────────────────────────────┘
  │   ↓
  │   descricao = observacoes || descricao_original
  │   ↓
  │   ├─── VAZIO? → semTexto++, naoClassificados++, PULAR
  │   │
  │   └─── TEM TEXTO → CONTINUAR
  │         ↓
  │       ┌───────────────────────────────────────┐
  │       │ 6.2. CHAMAR classificarLancamento()   │
  │       │      (classificacao-automatica.js)    │
  │       └───────────────────────────────────────┘
  │         ↓
  │         │
  │         ├─────────────────────────────────────┐
  │         │ 6.2.1. TENTAR PALAVRAS-CHAVE       │
  │         ├─────────────────────────────────────┤
  │         │ SELECT id, nome, tipo, palavras_chave│
  │         │ FROM bank_categorias                │
  │         │ WHERE empresa IN ('TODAS', 'ALLMAX')│
  │         │   AND ativo = true                  │
  │         │   AND palavras_chave IS NOT NULL    │
  │         │ ORDER BY ordem                      │
  │         └─────────────────────────────────────┘
  │         ↓
  │         Para cada categoria:
  │         ↓
  │         Para cada palavra em palavras_chave:
  │         ↓
  │         ┌───────────────────────────────────┐
  │         │ testarPalavraChave()              │
  │         ├───────────────────────────────────┤
  │         │ • Remove acentos                  │
  │         │ • Lowercase                       │
  │         │ • Testa wildcard (*) ou exata     │
  │         │ • Word boundary (\b)              │
  │         └───────────────────────────────────┘
  │         ↓
  │         ├─── BATEU? → RETURN categoria
  │         │
  │         └─── NÃO BATEU? → CONTINUAR
  │               ↓
  │               Nenhuma palavra bateu?
  │               ↓
  │             ┌─────────────────────────────────────┐
  │             │ 6.2.2. TENTAR CHAVE APRENDIDA      │
  │             ├─────────────────────────────────────┤
  │             │ SELECT id, nome, tipo,             │
  │             │        chave_aprendida             │
  │             │ FROM bank_categorias               │
  │             │ WHERE empresa IN ('TODAS','ALLMAX')│
  │             │   AND ativo = true                 │
  │             │   AND chave_aprendida IS NOT NULL  │
  │             │ ORDER BY ordem                     │
  │             └─────────────────────────────────────┘
  │             ↓
  │             Para cada categoria:
  │             ↓
  │             Para cada regra em chave_aprendida:
  │             ↓
  │             Parsear regra:
  │             "frase|valor|tol|cpfCnpj|obs"
  │             ↓
  │             ┌───────────────────────────────────┐
  │             │ testarChaveAprendida()            │
  │             ├───────────────────────────────────┤
  │             │ 1️⃣ Testa FRASE na descrição      │
  │             │    → descricao.includes(frase)?   │
  │             │                                   │
  │             │ 2️⃣ Testa VALOR ± tolerância      │
  │             │    → valor dentro do range?       │
  │             │                                   │
  │             │ 3️⃣ Testa CPF/CNPJ (se != "*")    │
  │             │    → cpf bate?                    │
  │             └───────────────────────────────────┘
  │             ↓
  │             ├─── TUDO BATEU? → RETURN categoria
  │             │
  │             └─── NÃO BATEU? → CONTINUAR
  │                   ↓
  │                   Nenhuma chave bateu?
  │                   ↓
  │                 ┌─────────────────────────────────┐
  │                 │ 6.2.3. NÃO ENCONTROU NENHUMA   │
  │                 ├─────────────────────────────────┤
  │                 │ RETURN null                     │
  │                 └─────────────────────────────────┘
  │
  │   ↓
  │ ┌───────────────────────────────────────┐
  │ │ 6.3. RESULTADO DA CLASSIFICAÇÃO       │
  │ └───────────────────────────────────────┘
  │   ↓
  │   ├─── ENCONTROU (categoria_id != null)?
  │   │    ↓
  │   │    UPDATE bank_extratos
  │   │    SET classificacao = categoria_nome,
  │   │        status = 'OK',
  │   │        classificado_em = NOW()
  │   │    WHERE id = registro.id
  │   │    ↓
  │   │    classificados++
  │   │
  │   └─── NÃO ENCONTROU (null)?
  │        ↓
  │        semRegra++
  │        naoClassificados++
  │        (não faz UPDATE)
  │
  ↓ PRÓXIMO REGISTRO
  ↓
TODOS PROCESSADOS?
  ↓
┌─────────────────────────────────────────────┐
│ 7. RETORNAR ESTATÍSTICAS                   │
├─────────────────────────────────────────────┤
│ {                                           │
│   sucesso: true,                            │
│   stats: {                                  │
│     analisados: 228,                        │
│     semTexto: 0,                            │
│     semRegra: 180,                          │
│     classificados: 48,                      │
│     naoClassificados: 180,                  │
│     erros: 0                                │
│   }                                         │
│ }                                           │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ 8. FRONTEND: EXIBIR RESULTADO               │
├─────────────────────────────────────────────┤
│ ✅ Reclassificação concluída!              │
│                                             │
│ 📊 Estatísticas:                            │
│ • Analisados: 228                           │
│ • Classificados: 48                         │
│ • Não classificados: 180                    │
│   └─ Sem texto: 0                           │
│   └─ Sem regra: 180                         │
│ • Taxa de sucesso: 21.1%                    │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ 9. RECARREGAR EXTRATO                      │
├─────────────────────────────────────────────┤
│ buscarExtrato()                             │
│ → Nova consulta com filtros atuais          │
│ → Mostra registros classificados como OK    │
└─────────────────────────────────────────────┘
  ↓
FIM
```

---

## 📋 ESTRUTURA DAS TABELAS

### **bank_categorias**

```sql
CREATE TABLE bank_categorias (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100),
  tipo VARCHAR(20),  -- 'CREDITO', 'DEBITO'
  empresa VARCHAR(20),  -- 'TODAS', 'ALLMAX', 'IMOBEM', 'SUMMER'
  ativo BOOLEAN,
  ordem INTEGER,
  palavras_chave TEXT,  -- "pix,transferencia,ted"
  chave_aprendida TEXT  -- "Hora_MOTOR 586-E2|9800|10|*|Cobrança"
);
```

### **Exemplo de palavras_chave:**
```
"taxa de notificacao,taxa do pix,taxa de mensageria"
```

### **Exemplo de chave_aprendida:**
```
"Hora_MOTOR 586-E2|9800|10|12345678901|Fulano da Silva,
 PIX recebido|5000|5|*|Qualquer pessoa"
```

**Formato:** `frase|valorCentavos|tolerancia|cpfCnpj|observacao`

---

## 🎯 EXEMPLOS PRÁTICOS

### **Exemplo 1: Classificação por Palavra-chave**

```
REGISTRO:
  descricao: "Taxa de notificacao por WhatsApp da cobranca 123"
  valor: 0.35
  empresa: ALLMAX

CATEGORIA:
  nome: "Despesa - Taxa Bancária"
  palavras_chave: "taxa de notificacao,taxa do pix"

TESTE:
  "taxa de notificacao por whatsapp..." 
  .includes("taxa de notificacao")
  → TRUE ✅

RESULTADO:
  classificacao = "Despesa - Taxa Bancária"
  status = "OK"
```

### **Exemplo 2: Classificação por Chave Aprendida**

```
REGISTRO:
  descricao: "Hora_MOTOR 586-E2 Fulano Silva"
  valor: 98.00
  cpf_cnpj_origem: "12345678901"
  empresa: ALLMAX

CATEGORIA:
  nome: "Receita - Hora Motor"
  chave_aprendida: "Hora_MOTOR 586-E2|9800|10|12345678901|Cobrança"

TESTE:
  1. Frase: "Hora_MOTOR 586-E2" → TRUE ✅
  2. Valor: 98.00 (9800 centavos)
     Range: 8820-10780 (±10%)
     → TRUE ✅
  3. CPF: "12345678901" = "12345678901"
     → TRUE ✅

RESULTADO:
  classificacao = "Receita - Hora Motor"
  status = "OK"
```

### **Exemplo 3: Não Classificado**

```
REGISTRO:
  descricao: "Compra no supermercado XYZ"
  valor: 150.00
  empresa: ALLMAX

CATEGORIAS:
  Nenhuma palavra-chave bate ❌
  Nenhuma chave aprendida bate ❌

RESULTADO:
  classificacao = null
  status = PENDENTE
  stats.semRegra++
  stats.naoClassificados++
```

---

## 🔧 DIFERENÇAS: ANTES vs DEPOIS

### ❌ **ANTES (ERRADO):**

```javascript
// Usava tabela ANTIGA
SELECT * FROM bank_regras_classificacao
WHERE ativa = true

// Resultado: 0 regras (tabela vazia ou desatualizada)
```

### ✅ **DEPOIS (CORRETO):**

```javascript
// Usa tabela ATUAL
import { classificarLancamento } from './classificacao-automatica.js';

// 1. Tenta palavras_chave
// 2. Tenta chave_aprendida
// 3. Retorna categoria ou null

// Resultado: classificação funcional!
```

---

## 📊 PRIORIDADE DE CLASSIFICAÇÃO

```
1º → palavras_chave (mais simples)
      └─ Só texto, sem valor
      └─ Mais rápido
      └─ Menos específico

2º → chave_aprendida (mais complexa)
      └─ Texto + Valor ± tolerância + CPF
      └─ Mais lento
      └─ Mais específico

Se AMBOS baterem → PALAVRAS_CHAVE vence (vem primeiro)
```

---

## 🎯 QUANDO USAR CADA TIPO

### **PALAVRAS_CHAVE:**
```
✅ Taxas fixas (taxa de notificacao, taxa do pix)
✅ Categorias genéricas (combustivel, mensalidade)
✅ Sem necessidade de validar valor
```

### **CHAVE_APRENDIDA:**
```
✅ Valores específicos (Hora MOTOR = R$ 98,00 ±10%)
✅ Cliente específico (CPF 123... = Fulano)
✅ Regras complexas que precisam valor + texto
```

---

## 💡 DICAS DE USO

### **Adicionar nova palavra-chave:**
```sql
UPDATE bank_categorias
SET palavras_chave = 'palavra1,palavra2,palavra3'
WHERE id = 10;
```

### **Adicionar nova chave aprendida:**
```sql
-- Via WhatsApp: comando "lll" → "aprender"
-- Ou direto no banco:
UPDATE bank_categorias
SET chave_aprendida = 'frase|valor|tol|cpf|obs'
WHERE id = 10;
```

### **Ver regras de uma categoria:**
```sql
SELECT id, nome, palavras_chave, chave_aprendida
FROM bank_categorias
WHERE id = 10;
```

---

## 🔍 TROUBLESHOOTING

### **Não classificou nada (0 classificados):**
```
1. Verificar se bank_categorias tem registros:
   SELECT * FROM bank_categorias WHERE ativo = true;

2. Verificar se palavras_chave não está vazia:
   SELECT * FROM bank_categorias WHERE palavras_chave IS NOT NULL;

3. Testar palavra manualmente:
   SELECT * FROM bank_extratos
   WHERE LOWER(descricao_original) LIKE '%palavra%';
```

### **Classificou errado:**
```
1. Verificar ordem das categorias:
   SELECT * FROM bank_categorias ORDER BY ordem;

2. Primeira que bater = vence!
   Reordenar se necessário (mudar campo "ordem")
```

### **Classificou alguns, outros não:**
```
1. Ver quais não classificaram:
   SELECT * FROM bank_extratos
   WHERE classificacao IS NULL
   LIMIT 10;

2. Ver descrição e identificar padrão:
   → Adicionar palavra-chave
   → Ou criar chave aprendida
```

---

## ✅ RESUMO EXECUTIVO

```
ENTRADA:
  • Filtros: empresa + intervalo de datas
  • Registros não classificados

PROCESSAMENTO:
  1. Busca registros no BD
  2. Para cada:
     → Tenta palavras_chave
     → Tenta chave_aprendida
     → Atualiza se encontrou
     → Pula se não encontrou

SAÍDA:
  • Estatísticas detalhadas
  • Extrato recarregado
  • Registros marcados como OK
```

**Fim do fluxograma!** 🎯
