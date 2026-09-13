# 📊 FLUXOGRAMA COMPLETO - SISTEMA DE APRENDIZADO

**Versão:** V.260912160000  
**Data:** 12/09/2026

---

## 🔄 FLUXO GERAL DO SISTEMA

```
┌──────────────────────────────────────────────────────────┐
│  LANÇAMENTO BANCÁRIO NOVO                                │
│  (Webhook Asaas, Sync Sicredi, etc)                      │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  Identificar Tipo    │
          │                      │
          │  tipo_importacao?    │
          │  id_transacao_banco? │
          └──────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
      SIM│É COBRANÇA         NÃO│OUTROS
         │Asaas?                 │(PIX avulso, TED, etc)
         │                       │
         ▼                       ▼
┌────────────────────┐   ┌──────────────────────┐
│ PRIORIDADE:        │   │ PRIORIDADE:          │
│ palavras_chave     │   │ chave_aprendida      │
└────────┬───────────┘   └───────┬──────────────┘
         │                       │
         ▼                       ▼
┌────────────────────┐   ┌──────────────────────┐
│ Testa palavras     │   │ Testa frase +        │
│ em categorias      │   │ valor ± tolerância   │
└────────┬───────────┘   └───────┬──────────────┘
         │                       │
    ┌────┴────┐             ┌────┴────┐
    │ Match?  │             │ Match?  │
    └────┬────┘             └────┬────┘
       SIM│NÃO                SIM│NÃO
         │ │                    │ │
         │ └──────┐             │ └──────┐
         │        │             │        │
         ▼        ▼             ▼        ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │Categoria│Não class│Categoria│Não class│
    │Status:  ││Status: ││Status:  ││Status: │
    │PENDENTE ││PENDENTE││OK       ││PENDENTE│
    │         ││        ││+ Obs    ││        │
    └────┬────┘└────┬───┘└────┬───┘└────┬───┘
         │          │         │         │
         └──────────┴─────────┴─────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Lançamento Salvo    │
         │  no Banco            │
         └──────────────────────┘
```

---

## 📱 FLUXO COMANDO "lll" (WhatsApp)

```
┌─────────────────────────────────────────┐
│  Usuário: "lll"                         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Buscar lançamentos PENDENTES (max 10)  │
└──────────────┬───────────────────────────┘
               │
        ┌──────┴──────┐
        │ Tem algum?  │
        └──────┬──────┘
          SIM  │  NÃO
            │  │
            │  └──> "✅ NENHUM PENDENTE"
            │
            ▼
┌────────────────────────────────────────┐
│  Mostrar 3 primeiros                  │
│  Salvar em estadoPendentes[grupoId]   │
│  etapa: 'escolher_numero'             │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  Aguardar resposta do usuário         │
└────────────────┬───────────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Usuário: "1"   │
        └────────┬───────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  Buscar categorias                    │
│  etapa: 'escolher_categoria'          │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  Mostrar lista de categorias          │
└────────────────┬───────────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Usuário: "7"   │
        └────────┬───────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  Pedir observação                     │
│  etapa: 'digitar_observacao'          │
└────────────────┬───────────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Usuário: "X"   │
        └────────┬───────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  Opções de recibo                     │
│  etapa: 'aguardar_recibo'             │
│                                        │
│  📎 Enviar arquivo                     │
│  ⏭️  "pular"                            │
│  🧠 "aprender"                         │
└────────────────┬───────────────────────┘
                 │
        ┌────────┴────────┬──────────────┐
        │                 │              │
     ARQUIVO          "pular"      "aprender"
        │                 │              │
        ▼                 ▼              ▼
   ┌─────────┐    ┌──────────┐   ┌────────────────┐
   │Upload   │    │Finalizar │   │Fluxo Aprender  │
   │Vercel   │    │Status:   │   │(ver abaixo)    │
   │Blob     │    │PENDENTE  │   └────────────────┘
   └────┬────┘    └──────────┘
        │
        ▼
   ┌─────────────────┐
   │Aguardar mais?   │
   └────┬────────────┘
        │
   ┌────┴─────┐
   │"gravar"  │
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │Finalizar │
   │Status: OK│
   └──────────┘
```

---

## 🧠 FLUXO "APRENDER" (Detalhado)

```
┌─────────────────────────────────────────┐
│  Usuário: "aprender"                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  etapa: 'aprender_copiar_descricao'     │
│                                          │
│  Mostrar descrição completa:            │
│  "Hora_MOTOR 586-E2 11/09/2026 0.3h"    │
│                                          │
│  Pedir copy/paste do trecho             │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Usuário cola: "Hora_MOTOR 586-E2"      │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Salvar em estado.fraseChave            │
│  etapa: 'aprender_tolerancia'           │
│                                          │
│  Calcular:                              │
│  valorInteiro = floor(abs(valor))       │
│  = floor(98.93) = 98                    │
│                                          │
│  Mostrar exemplos de tolerância        │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Usuário: "10"                          │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Montar regra:                          │
│  "Hora_MOTOR 586-E2|98|10|X"            │
│                                          │
│  fraseChave|valor|tolerancia|obs        │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Buscar categoria atual                 │
│  chave_aprendida existente?             │
└──────────────┬───────────────────────────┘
               │
        ┌──────┴──────┐
        │ Existe?     │
        └──────┬──────┘
          SIM  │  NÃO
            │  │
            ▼  ▼
┌────────────────────────────────────────┐
│  Adicionar nova regra:                │
│                                        │
│  SE VAZIO:                            │
│    chave_aprendida = nova regra       │
│                                        │
│  SE TEM OUTRAS:                       │
│    chave_aprendida += ", nova regra"  │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  UPDATE bank_categorias               │
│  SET chave_aprendida = $1             │
│  WHERE id = 7                         │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  UPDATE bank_extratos                 │
│  SET                                  │
│    classificacao = 7,                 │
│    observacao = 'X',                  │
│    status = 'OK',                     │
│    classificado_por = 'Aprendizado'   │
│  WHERE id = lancamentoId              │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  Confirmar sucesso:                   │
│                                        │
│  ✅ REGRA CRIADA!                      │
│  📌 Categoria: ...                     │
│  🔍 Trecho: ...                        │
│  💰 Valor: ... ± ...%                  │
│  📚 Próximas vezes automáticas!        │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│  Limpar estadoPendentes[grupoId]      │
│  FIM                                  │
└────────────────────────────────────────┘
```

---

## 🔍 TESTE DE CHAVE APRENDIDA (Próximo Lançamento)

```
┌──────────────────────────────────────────┐
│  Lançamento novo:                       │
│  "Hora_MOTOR 586-E2 20/09/2026 0.5h"    │
│  Valor: R$ 105,00                       │
│  Tipo: CREDITO                          │
│  tipo_importacao: SYNC (não cobrança)   │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Identificar tipo                       │
│  → Não é cobrança Asaas                 │
│  → Usar chave_aprendida                 │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Buscar categorias com chave_aprendida  │
│  ORDER BY ordem                         │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Para cada categoria:                   │
│    Para cada regra:                     │
│      Testar frase + valor               │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Regra: "Hora_MOTOR 586-E2|98|10|X"     │
│                                          │
│  1. TESTE FRASE:                        │
│     descNorm = removeAcentos(desc)      │
│     = "hora_motor 586-e2 20/09..."      │
│                                          │
│     fraseNorm = removeAcentos(frase)    │
│     = "hora_motor 586-e2"               │
│                                          │
│     descNorm.includes(fraseNorm)?       │
│     → SIM! ✅                            │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  2. TESTE VALOR:                        │
│                                          │
│     valorLanc = floor(105.00) = 105     │
│     valorRef = 98                       │
│     tolerancia = 10%                    │
│                                          │
│     variacaoMax = 98 * 10 / 100 = 9.8   │
│     variacaoMax = floor(9.8) = 9        │
│                                          │
│     valorMin = 98 - 9 = 89              │
│     valorMax = 98 + 9 = 107             │
│                                          │
│     105 >= 89 E 105 <= 107?             │
│     → SIM! ✅                            │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  MATCH!                                 │
│                                          │
│  Retornar:                              │
│    categoria_id: 7                      │
│    categoria_nome: "Reenbolso..."       │
│    observacao_padrao: "X"               │
│    status: 'OK'                         │
│    metodo: 'Chave aprendida'            │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  UPDATE bank_extratos                   │
│  SET                                    │
│    classificacao = 7,                   │
│    observacao = 'X',                    │
│    status = 'OK',                       │
│    classificado_por = 'Sistema - ...'   │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Lançamento CLASSIFICADO AUTOMATICAMENTE│
│  Status: OK                             │
│  NÃO aparece em "lll" pendentes!        │
│  Nada mais a fazer! ✅                   │
└──────────────────────────────────────────┘
```

---

## 📊 COMPARAÇÃO: ANTES vs DEPOIS

### ANTES (Sem Aprendizado)

```
Lançamento → SEMPRE PENDENTE
          ↓
   Comando "lll"
          ↓
   Escolhe categoria
          ↓
   Digita observação
          ↓
   OBRIGATÓRIO enviar recibo
          ↓
   Status OK
          ↓
   PRÓXIMO lançamento:
   Repete TUDO de novo! 🔄
```

### DEPOIS (Com Aprendizado)

```
Lançamento → Testa tipo
          ↓
   ┌──────┴──────┐
   │             │
Cobrança     Outros
   │             │
PENDENTE   Testa chave
(precisa     aprendida
 recibo)        │
                ▼
         ┌──────┴──────┐
         │             │
      Match         Não match
         │             │
      Status OK    PENDENTE
         │
   NÃO precisa
   fazer nada!
         │
   PRÓXIMO igual:
   Automático! ✅
```

---

## 🎯 RESUMO VISUAL

```
╔═══════════════════════════════════════════════════════════╗
║  SISTEMA DE APRENDIZADO AUTOMÁTICO                       ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  ENTRADA:                                                 ║
║  └─ Lançamento bancário (webhook/sync)                    ║
║                                                           ║
║  PROCESSAMENTO:                                           ║
║  ├─ Identifica tipo (cobrança vs outros)                  ║
║  ├─ Testa regras (palavras_chave ou chave_aprendida)      ║
║  └─ Define status (PENDENTE ou OK)                        ║
║                                                           ║
║  COMANDO WhatsApp:                                        ║
║  ├─ "lll" → lista pendentes                               ║
║  ├─ Escolhe categoria + observação                        ║
║  └─ Opções: arquivo / pular / APRENDER                    ║
║                                                           ║
║  APRENDIZADO:                                             ║
║  ├─ Copy/paste descrição (trecho específico)              ║
║  ├─ Define % tolerância no valor                          ║
║  ├─ Salva regra em chave_aprendida                        ║
║  └─ Próximas vezes: AUTOMÁTICO!                           ║
║                                                           ║
║  SAÍDA:                                                   ║
║  └─ Lançamento classificado (OK ou PENDENTE)              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

---

**Criado em:** 12/09/2026 16:30  
**Versão:** V.260912160000  
**Branch:** dev
