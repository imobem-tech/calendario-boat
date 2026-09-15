# 📊 IMPORTAR vs ENRIQUECER - Qual a Diferença?

## 🎯 RESUMO EXECUTIVO

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║  📥 IMPORTAR OFX = Trazer dados NOVOS do arquivo                ║
║                                                                  ║
║  🔍 ENRIQUECER  = Completar dados que JÁ EXISTEM no BD          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 📥 IMPORTAÇÃO OFX

### Quando usar?
✅ Quando receber um novo arquivo .ofx do banco
✅ Primeira importação do mês
✅ Precisa trazer transações novas

### O que faz?

```
┌──────────────┐
│ Arquivo OFX  │
│  242 trans.  │
└──────┬───────┘
       │
       ↓ LEITURA
       │
   ┌───┴────┐
   │ Parser │
   └───┬────┘
       │
       ↓ VALIDAÇÃO
       │
   ┌───┴────────────────────┐
   │ Detecta duplicatas     │
   │ (por DATA + VALOR)     │
   └───┬────────────────────┘
       │
       ↓ INSERT
       │
┌──────┴────────────────────────┐
│ bank_extratos                 │
├───────────────────────────────┤
│ ✅ data                       │
│ ✅ valor                      │
│ ✅ descricao_original         │
│ ✅ tipo (CREDITO/DEBITO)      │
│ ✅ banco                      │
│ ✅ empresa                    │
│                               │
│ ❌ nome_origem = NULL         │
│ ❌ cpf_cnpj_origem = NULL     │
│ ❌ observacoes = NULL         │
│ ❌ classificacao = NULL       │
│ ❌ status = PENDENTE          │
└───────────────────────────────┘

RESULTADO: Dados CRUS importados
```

### Como executar?
```bash
node wpp/routes/banco/importar_ofx.js
```

---

## 🔍 ENRIQUECIMENTO

### Quando usar?
✅ Após importar OFX
✅ Quando cadastrar novos clientes
✅ Quando criar novas CRs
✅ Toda vez que quiser "completar" dados faltantes

### O que faz?

```
┌──────────────────────────────┐
│ bank_extratos (dados crus)   │
├──────────────────────────────┤
│ ❌ nome_origem = NULL        │
│ ❌ cpf_cnpj_origem = NULL    │
│ ❌ observacoes = NULL        │
└──────────┬───────────────────┘
           │
           ↓ ANÁLISE
           │
   ┌───────┴────────────────────┐
   │ Extrai nome da descrição   │
   │ "...fatura PERITO GARCIA"  │
   │ → Nome: PERITO GARCIA      │
   └───────┬────────────────────┘
           │
           ↓ BUSCA
           │
   ┌───────┴────────────────────┐
   │ Tabela Cliente             │
   │ WHERE nome ILIKE '%PERITO%'│
   │ → Encontrado! ✅           │
   └───────┬────────────────────┘
           │
           ↓ VINCULA CR
           │
   ┌───────┴────────────────────┐
   │ Tabela Contas_Receber      │
   │ WHERE cliente + data + valor│
   │ → CR Encontrada! ✅        │
   └───────┬────────────────────┘
           │
           ↓ CLASSIFICA
           │
   ┌───────┴────────────────────┐
   │ bank_regras_classificacao  │
   │ Palavras-chave batem ✅    │
   │ → Categoria definida!      │
   └───────┬────────────────────┘
           │
           ↓ UPDATE
           │
┌──────────┴───────────────────┐
│ bank_extratos (ENRIQUECIDO)  │
├──────────────────────────────┤
│ ✅ nome_origem = "PERITO..."│
│ ✅ cpf_cnpj_origem = "123..."│
│ ✅ observacoes = "Mensalid..."│
│ ✅ classificacao = "Receita"│
│ ✅ status = OK               │
└──────────────────────────────┘

RESULTADO: Dados COMPLETOS
```

### Como executar?
```
Click no botão "🔍 Enriquecer Dados"
(no extrato_bancario.html)
```

---

## 🔄 FLUXO COMPLETO RECOMENDADO

```
1️⃣ IMPORTAR (Uma vez por arquivo)
   ↓
   node importar_ofx.js
   ↓
   ✅ 242 transações brutas no BD
   
   ↓
   
2️⃣ ENRIQUECER (Sempre que precisar)
   ↓
   Click "🔍 Enriquecer Dados"
   ↓
   ✅ Nome + CPF preenchidos
   ✅ CR vinculada
   ✅ Classificação aplicada
   
   ↓
   
3️⃣ RECLASSIFICAR (Quando adicionar regras)
   ↓
   Adiciona palavras-chave novas
   ↓
   Click "🏷️ Reclassificar"
   ↓
   ✅ Novas categorias aplicadas
   
   ↓
   
4️⃣ AJUSTES MANUAIS (Se necessário)
   ↓
   Click no botão "✏️" de cada lançamento
   ↓
   Corrige manualmente
```

---

## 📊 TABELA COMPARATIVA

| Aspecto | 📥 IMPORTAR OFX | 🔍 ENRIQUECER |
|---------|----------------|---------------|
| **Função** | Trazer dados novos | Completar dados existentes |
| **Fonte** | Arquivo .ofx | Banco de dados (Cliente, CR) |
| **Frequência** | Uma vez por arquivo | Quantas vezes precisar |
| **Execução** | Script manual | Botão no HTML |
| **Resultado** | INSERT novos registros | UPDATE registros existentes |
| **Dados gerados** | Básicos (data, valor, descrição) | Complementares (nome, CPF, categoria) |
| **Duplicatas** | Detecta e evita | Não importa duplicatas |
| **Pré-requisito** | Ter arquivo .ofx | Ter dados importados |

---

## 💡 EXEMPLOS DE USO

### Cenário 1: Novo mês
```
1. Baixar OFX do Asaas (01 a 30/Set)
2. Executar: node importar_ofx.js
3. Click "🔍 Enriquecer Dados"
4. Click "🏷️ Reclassificar"
✅ Pronto!
```

### Cenário 2: Cadastrou cliente novo
```
1. Cadastra cliente "João Silva" no sistema
2. Click "🔍 Enriquecer Dados"
3. Sistema vincula transações antigas do João
✅ Histórico completo!
```

### Cenário 3: Criou novas regras
```
1. Adiciona palavra "combustível" → Categoria "Despesa - Combustível"
2. Click "🏷️ Reclassificar"
3. Sistema reclassifica tudo com "combustível"
✅ Categorias atualizadas!
```

---

## 🎯 RESUMO VISUAL

```
PROCESSO COMPLETO:

┌────────────┐      ┌──────────────┐      ┌─────────────┐
│ Arquivo    │      │  Banco de    │      │   Dados     │
│    OFX     │  →   │   Dados      │  →   │ Completos   │
│            │      │   (cru)      │      │  (prontos)  │
└────────────┘      └──────────────┘      └─────────────┘
     📥                   🔍                     ✅
  IMPORTAR            ENRIQUECER            RESULTADO
  (1 vez)            (N vezes)             (Usável!)
```

---

## 🚦 CHECKLIST

Antes de usar cada ferramenta, verifique:

### ✅ IMPORTAR OFX
- [ ] Tenho o arquivo .ofx baixado?
- [ ] É do período correto?
- [ ] Não importei esse arquivo antes?
→ Se SIM para todos: **PODE IMPORTAR**

### ✅ ENRIQUECER
- [ ] Já importei os dados OFX?
- [ ] Tem registros sem nome_origem?
- [ ] Clientes cadastrados no sistema?
→ Se SIM para todos: **PODE ENRIQUECER**

### ✅ RECLASSIFICAR
- [ ] Já tenho dados no BD?
- [ ] Criei/atualizei regras de palavras-chave?
- [ ] Tem registros não classificados?
→ Se SIM para todos: **PODE RECLASSIFICAR**

---

**Em resumo:** 
- **IMPORTAR** = Entrada de dados
- **ENRIQUECER** = Processamento inteligente
- **RECLASSIFICAR** = Ajuste fino

São **complementares**, não concorrentes! 🎯
