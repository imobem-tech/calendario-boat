# PLANO DE AÇÃO - DUPLICAÇÕES OUTUBRO 2026
**Data:** 06/10/2026 13:55  
**Versão:** V.2610061355

---

## 📊 DIAGNÓSTICO

### Duplicações Encontradas (desde 01/10/2026)
- **Total de registros duplicados:** 4
- **Códigos duplicados:** 2

#### Código 58369 (2 duplicações)
1. **ID 50173** - LEANDRO MANZANO SORROCHE
   - Cliente: 3449 | CPF: 91015910106
   - Empresa: SUMMER MENSAL | Valor: R$ 300,00
   - Status: ✅ PAGO (06/10/2026)
   - Obs: Asaas_2026-10-06T09-58-41

2. **ID 50192** - CHARLES COSTA LOPES
   - Cliente: 3670 | CPF: 01580632106
   - Empresa: ALLMAX | Valor: R$ 17,70
   - Status: ✅ PAGO (06/10/2026)
   - Obs: Asaas_2026-10-06T09-58-41

#### Código 58370 (2 duplicações)
1. **ID 50174** - HELCIO BRITO BARROS
   - Cliente: 3879 | CPF: 12245445104
   - Empresa: SUMMER MENSAL | Valor: R$ 450,00
   - Status: ⏳ ABERTO

2. **ID 50193** - PABLO ARAUJO MORAES
   - Cliente: 4358 | CPF: 02285476108
   - Empresa: SUMMER MENSAL | Valor: R$ 550,44
   - Status: ⏳ ABERTO

---

## ⚠️ PROBLEMA RAIZ

### SEQUENCE Desatualizada
```
SEQUENCE atual:     58389
Maior código banco: 58402
DIFERENÇA:          13 códigos gerados SEM a SEQUENCE!
```

**CAUSA:** Código VBA (Access) e/ou Node.js ainda está usando `MAX(Codigo) + 1` em vez da função `gerar_proximo_codigo_cr()`

---

## 🎯 PLANO DE AÇÃO

### ETAPA 1: Corrigir Códigos Duplicados Atuais ⚠️ URGENTE

#### 1.1 Reatribuir Código 58369
**Conta a manter código original:** ID 50173 (primeira criada, Data_Conta: 05/10)
**Conta a receber novo código:** ID 50192 (segunda criada, Data_Conta: 06/10)

```sql
-- Gerar novo código e atualizar
UPDATE "Contas_Receber"
SET "Codigo" = (SELECT gerar_proximo_codigo_cr()),
    "Documento" = (SELECT gerar_proximo_codigo_cr())::text
WHERE "ID" = 50192;
```

#### 1.2 Reatribuir Código 58370
**Conta a manter código original:** ID 50174 (primeira criada, Data_Conta: 05/10)
**Conta a receber novo código:** ID 50193 (segunda criada, Data_Conta: 06/10)

```sql
-- Gerar novo código e atualizar
UPDATE "Contas_Receber"
SET "Codigo" = (SELECT gerar_proximo_codigo_cr()),
    "Documento" = (SELECT gerar_proximo_codigo_cr())::text
WHERE "ID" = 50193;
```

---

### ETAPA 2: Sincronizar SEQUENCE com o Banco

```sql
-- Buscar o maior código atual
SELECT MAX("Codigo") as max_codigo FROM "Contas_Receber";
-- Resultado esperado: 58402 (ou maior após as correções)

-- Ajustar SEQUENCE para o próximo valor disponível
SELECT setval('contas_receber_codigo_seq', (SELECT MAX("Codigo") FROM "Contas_Receber") + 1);
```

---

### ETAPA 3: Garantir Uso da SEQUENCE em TODOS os Pontos

#### 3.1 Verificar Node.js (wpp/asaas.js)
**Arquivo:** `wpp/asaas.js`

**Verificar se está usando:**
```javascript
const result = await pool.query('SELECT gerar_proximo_codigo_cr() as codigo');
const novoCodigo = result.rows[0].codigo;
```

**NÃO deve usar:**
```javascript
// ❌ ERRADO - race condition
const result = await pool.query('SELECT MAX("Codigo") + 1 as codigo FROM "Contas_Receber"');
```

#### 3.2 Verificar VBA (Access)
**Arquivo:** Access VBA

**Deve usar:**
```vba
' ✅ CORRETO
strSQL = "SELECT gerar_proximo_codigo_cr() as codigo"
```

**NÃO deve usar:**
```vba
' ❌ ERRADO
strSQL = "SELECT MAX(Codigo) + 1 as codigo FROM Contas_Receber"
```

---

### ETAPA 4: Criar Monitoramento Preventivo

#### 4.1 Script de Auditoria Diária
**Arquivo:** `auditoria_diaria_duplicacoes.js`

Executar todo dia às 6h (antes do expediente) para:
- Verificar se há códigos duplicados criados no dia anterior
- Verificar se SEQUENCE está sincronizada
- Enviar alerta para grupo ADM se houver problema

#### 4.2 Trigger de Validação (Opcional - requer análise)
```sql
-- Criar trigger que valida se o código já existe antes de inserir
CREATE OR REPLACE FUNCTION validar_codigo_unico()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "Contas_Receber"
        WHERE "Codigo" = NEW."Codigo"
        AND "ID" != NEW."ID"
    ) THEN
        RAISE EXCEPTION 'Código % já existe! Use gerar_proximo_codigo_cr()', NEW."Codigo";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validar_codigo_unico
BEFORE INSERT OR UPDATE ON "Contas_Receber"
FOR EACH ROW
EXECUTE FUNCTION validar_codigo_unico();
```

---

## 📋 CHECKLIST DE EXECUÇÃO

### Imediato (Hoje)
- [ ] 1. Executar reatribuição do código 58369 (ID 50192)
- [ ] 2. Executar reatribuição do código 58370 (ID 50193)
- [ ] 3. Sincronizar SEQUENCE com MAX do banco
- [ ] 4. Verificar código Node.js (wpp/asaas.js)
- [ ] 5. Verificar código VBA (Access)

### Curto Prazo (Esta Semana)
- [ ] 6. Criar script de auditoria diária
- [ ] 7. Agendar auditoria diária (cron job)
- [ ] 8. Testar geração de códigos em ambiente de homologação
- [ ] 9. Documentar procedimento correto de geração de códigos

### Médio Prazo (Próximas 2 Semanas)
- [ ] 10. Avaliar implementação do trigger de validação
- [ ] 11. Criar dashboard de monitoramento (duplicações x tempo)
- [ ] 12. Revisar TODOS os pontos que geram Contas_Receber

---

## 🚨 ALERTAS E OBSERVAÇÕES

### ⚠️ ATENÇÃO - Contas Pagas
- IDs 50173 e 50192 estão PAGAS pelo Asaas
- Verificar se há impacto em relatórios de faturamento
- Verificar se o cliente foi cobrado 2 vezes

### ⚠️ ATENÇÃO - Contas Abertas
- IDs 50174 e 50193 estão ABERTAS
- Reatribuir códigos ANTES de qualquer pagamento
- Verificar se há boletos gerados com os códigos duplicados

### ⚠️ ATENÇÃO - SEQUENCE
- CRITICAL: 13 códigos foram gerados SEM usar a SEQUENCE
- Isso indica que o problema pode estar ocorrendo com frequência
- Prioridade MÁXIMA em corrigir os pontos de geração de código

---

## 📊 LOGS E RASTREABILIDADE

### Arquivos de Análise Gerados
- `analise_duplicacoes_outubro_2026.js` — V.2610061345
- `verificar_estrutura_cr.js` — V.2610061350
- `PLANO_ACAO_DUPLICACOES_OUT2026.md` — V.2610061355

### Próximos Arquivos a Criar
- `corrigir_duplicacoes_out2026.js` — Script de correção automática
- `sincronizar_sequence.js` — Script de sincronização
- `auditoria_diaria_duplicacoes.js` — Monitoramento preventivo

---

**Status:** 🔴 CRÍTICO - Ação Imediata Necessária  
**Responsável:** Time Desenvolvimento  
**Prazo:** Correção imediata (hoje) + Monitoramento contínuo
