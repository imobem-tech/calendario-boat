# 🔄 FLUXOGRAMA: ENRIQUECIMENTO DE DADOS

## 📊 VISÃO GERAL

```
┌─────────────────────────────────────────────────────────────┐
│                    DIFERENÇA IMPORTANTE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📥 IMPORTAÇÃO OFX (Script Manual)                          │
│  └─ Traz novos registros do arquivo .ofx                    │
│  └─ Cria lançamentos no BD                                  │
│  └─ Dados básicos: data, valor, descrição                   │
│                                                              │
│  🔍 ENRIQUECIMENTO (Botão no HTML)                          │
│  └─ Trabalha com registros já existentes                    │
│  └─ Complementa dados faltantes                             │
│  └─ Adiciona: nome cliente, CPF, CR, classificação          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 FLUXO COMPLETO DO ENRIQUECIMENTO

```
INÍCIO
  ↓
┌─────────────────────────────────────────────┐
│ 1. BUSCAR REGISTROS PARA ENRIQUECER        │
├─────────────────────────────────────────────┤
│ SELECT * FROM bank_extratos                 │
│ WHERE tipo_importacao = 'OFX'               │
│   AND banco = 'Asaas'                       │
│   AND empresa = 'ALLMAX'                    │
│   AND nome_origem IS NULL ← SEM NOME        │
└─────────────────────────────────────────────┘
  ↓
  ↓ Para cada registro encontrado...
  ↓
┌─────────────────────────────────────────────┐
│ 2. EXTRAIR NOME DA DESCRIÇÃO OFX           │
├─────────────────────────────────────────────┤
│ Descrição:                                  │
│ "Cobranca recebida - fatura nr. 907981201   │
│  PERITO GARCIA"                             │
│                                             │
│ Nome extraído: "PERITO GARCIA" ✅           │
└─────────────────────────────────────────────┘
  ↓
  ↓ Se conseguiu extrair nome...
  ↓
┌─────────────────────────────────────────────┐
│ 3. BUSCAR CLIENTE NO BANCO                 │
├─────────────────────────────────────────────┤
│ SELECT Codigo, Cliente_Nome, Cliente_CPF    │
│ FROM Cliente                                │
│ WHERE Cliente_Nome ILIKE '%PERITO GARCIA%'  │
│   AND Empresa = 1 (ALLMAX)                  │
└─────────────────────────────────────────────┘
  ↓
  ├─── 0 resultados → PULAR registro
  ├─── 1 resultado  → USAR esse cliente ✅
  └─── 2+ resultados → DESEMPATE POR CR ⤵
       ↓
     ┌─────────────────────────────────────────────┐
     │ 3.1. DESEMPATE COM CONTA A RECEBER         │
     ├─────────────────────────────────────────────┤
     │ Para cada cliente encontrado:               │
     │                                             │
     │ SELECT * FROM Contas_Receber                │
     │ WHERE Código_Cliente = {cliente}            │
     │   AND Data_Vencimento ≈ data_extrato (±7d) │
     │   AND Valor ≈ valor_extrato (±5%)          │
     │                                             │
     │ → Primeiro que tiver CR = VENCEDOR ✅       │
     └─────────────────────────────────────────────┘
  ↓
  ↓ Cliente selecionado!
  ↓
┌─────────────────────────────────────────────┐
│ 4. BUSCAR CONTA A RECEBER                  │
├─────────────────────────────────────────────┤
│ SELECT Descrição, Valor, Data_Vencimento    │
│ FROM Contas_Receber                         │
│ WHERE Código_Cliente = {cliente}            │
│   AND ABS(Data_Vencimento - data) <= 7 dias │
│   AND ABS((Valor - valor)/Valor) <= 0.05    │
│                                             │
│ Encontrou? → Pegar descrição da CR ✅       │
│ Não encontrou? → Continuar sem CR          │
└─────────────────────────────────────────────┘
  ↓
  ↓ Se encontrou CR...
  ↓
┌─────────────────────────────────────────────┐
│ 5. COPIAR DESCRIÇÃO DA CR                  │
├─────────────────────────────────────────────┤
│ observacoes = CR.Descrição                  │
│                                             │
│ Exemplo:                                    │
│ "Mensalidade Embarcação 576-Q1 Set/2026"   │
└─────────────────────────────────────────────┘
  ↓
  ↓
┌─────────────────────────────────────────────┐
│ 6. CLASSIFICAR AUTOMATICAMENTE             │
├─────────────────────────────────────────────┤
│ Buscar em bank_regras_classificacao:        │
│                                             │
│ Texto: "Mensalidade Embarcação..."         │
│                                             │
│ Regras ativas com palavras-chave:          │
│ ┌─────────────────────────────────────┐    │
│ │ Regra: "Mensalidade"                │    │
│ │ Palavras: "mensalidade,cobranca..."│    │
│ │ Classificação: "Receita - Mensalid" │    │
│ │                                     │    │
│ │ "mensalidade" encontrada! ✅        │    │
│ └─────────────────────────────────────┘    │
│                                             │
│ Aplicar: "Receita - Mensalidade Embarcação"│
└─────────────────────────────────────────────┘
  ↓
  ↓
┌─────────────────────────────────────────────┐
│ 7. ATUALIZAR REGISTRO NO BANCO             │
├─────────────────────────────────────────────┤
│ UPDATE bank_extratos SET                    │
│   nome_origem = "PERITO GARCIA",            │
│   cpf_cnpj_origem = "123.456.789-00",       │
│   observacoes = "Mensalidade Embarcação..." │
│   classificacao = "Receita - Mensalidade",  │
│   status = 'OK'                             │
│ WHERE id = {id}                             │
│                                             │
│ ✅ REGISTRO ENRIQUECIDO!                    │
└─────────────────────────────────────────────┘
  ↓
  ↓ Próximo registro...
  ↓
  ↓ Todos processados?
  ↓
┌─────────────────────────────────────────────┐
│ 8. RELATÓRIO FINAL                         │
├─────────────────────────────────────────────┤
│ 📊 Total processados: 215                   │
│ ✅ Clientes encontrados: 103                │
│ 💰 CRs vinculadas: 87                       │
│ 🏷️ Classificados: 65                        │
│ ⚠️  Sem nome: 40                            │
│ ❌ Erros: 0                                 │
└─────────────────────────────────────────────┘
  ↓
FIM
```

---

## 📝 EXEMPLO PRÁTICO

### ANTES DO ENRIQUECIMENTO:

```sql
┌────┬────────────┬─────────┬──────────────────────────────────┬─────────────┬───────┬───────────────┐
│ ID │    Data    │  Valor  │        Descrição Original        │ Nome Origem │  CPF  │ Classificação │
├────┼────────────┼─────────┼──────────────────────────────────┼─────────────┼───────┼───────────────┤
│255 │ 2026-09-01 │  550.44 │ Cobranca recebida - fatura nr.   │   NULL      │ NULL  │     NULL      │
│    │            │         │ 896771521 ALLEFE HENRIQUE NUNES  │             │       │               │
└────┴────────────┴─────────┴──────────────────────────────────┴─────────────┴───────┴───────────────┘
```

### DEPOIS DO ENRIQUECIMENTO:

```sql
┌────┬────────────┬─────────┬──────────────────────────────────┬───────────────────────────┬──────────────────┬─────────────────────────────┐
│ ID │    Data    │  Valor  │        Descrição Original        │       Nome Origem         │       CPF        │       Classificação         │
├────┼────────────┼─────────┼──────────────────────────────────┼───────────────────────────┼──────────────────┼─────────────────────────────┤
│255 │ 2026-09-01 │  550.44 │ Cobranca recebida - fatura nr.   │ ALLEFE HENRIQUE NUNES     │ 123.456.789-00   │ Receita - Mensalidade       │
│    │            │         │ 896771521 ALLEFE HENRIQUE NUNES  │ AIRES                     │                  │ Embarcação                  │
│    │            │         │                                  │                           │                  │                             │
│    │            │         │ Observações:                     │                           │                  │ Status: OK ✅               │
│    │            │         │ "Mensalidade Embarcação 576-Q1"  │                           │                  │                             │
└────┴────────────┴─────────┴──────────────────────────────────┴───────────────────────────┴──────────────────┴─────────────────────────────┘
```

---

## 🎯 QUANDO USAR CADA UM?

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO COMPLETO                            │
└─────────────────────────────────────────────────────────────┘

1️⃣ IMPORTAR OFX (Script Manual - uma vez)
   ↓
   node wpp/routes/banco/importar_ofx.js
   ↓
   ✅ 242 transações importadas
   ❌ Mas sem nome, CPF, classificação
   ↓
   ↓
2️⃣ ENRIQUECER DADOS (Botão - sempre que precisar)
   ↓
   Click no botão "🔍 Enriquecer Dados"
   ↓
   ✅ Nome + CPF preenchidos
   ✅ CR vinculada
   ✅ Classificação aplicada
   ↓
   ↓
3️⃣ RECLASSIFICAR (Botão - quando adicionar novas regras)
   ↓
   Adiciona palavras-chave novas
   ↓
   Click no botão "🏷️ Reclassificar"
   ↓
   ✅ Novas classificações aplicadas
```

---

## ⚙️ CONFIGURAÇÕES

```javascript
// Tolerâncias para busca de CR:
Data: ±7 dias
Valor: ±5%

// Prioridade de texto para classificar:
1º - observacoes (descrição da CR)
2º - descricao_original (do OFX)

// Empresas (código no BD):
ALLMAX = 1
IMOBEM = 2
SUMMER = 3
```

---

## 🆘 TROUBLESHOOTING

```
❌ Cliente não encontrado
→ Nome no OFX diferente do cadastro
→ Solução: Ajustar nome no cadastro Cliente

❌ CR não encontrada
→ Data/valor fora da tolerância
→ Solução: Verificar se CR existe e valores batem

❌ Não classificou
→ Nenhuma palavra-chave bateu
→ Solução: Adicionar regras em bank_regras_classificacao
```

---

## 📌 RESUMO

**Enriquecer Dados = Complementar informações de registros já existentes**

✅ Não importa dados novos
✅ Complementa dados existentes
✅ Busca cliente
✅ Vincula CR
✅ Classifica automaticamente

**É um pós-processamento inteligente!** 🧠
