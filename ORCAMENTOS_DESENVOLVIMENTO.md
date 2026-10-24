# 📊 SISTEMA DE ORÇAMENTOS VIA WHATSAPP - DOCUMENTAÇÃO

**Versão:** V.2610241646  
**Última Atualização:** 24/10/2026 16:46  
**Status:** ✅ OPERACIONAL

---

## 📋 VISÃO GERAL

Sistema completo de gestão de orçamentos via WhatsApp, integrado ao grupo ORÇAMENTOS (120363412373130577@g.us).

**Principais Funcionalidades:**
- ✅ Criação de orçamentos multi-item
- ✅ Gestão de itens (adicionar, editar, excluir)
- ✅ Sistema de aprovação
- ✅ Rateio automático por cotas
- ✅ Rateio manual personalizado
- ✅ Geração de cobranças (Contas a Receber)
- ✅ Sistema de LOG completo
- ✅ Observações privadas
- ✅ Upload de anexos

---

## 🗂️ ESTRUTURA DE TABELAS

### **orcamento_servico**
Tabela principal de orçamentos.

**Campos principais:**
- `id_orcamento` - ID sequencial
- `numero` - Código único (ORC-AAMMDDHHMM)
- `id_embarcacao` - FK para P_BOAT_1_Embarcacao
- `descricao` - Título do orçamento
- `valor_servicos` - Subtotal dos itens
- `taxa_servico_perc` - % da taxa (padrão 20%)
- `taxa_servico_valor` - Valor da taxa em R$
- `valor_total` - Total final
- `status` - RASCUNHO, APROVADO, CANCELADO

### **orcamento_item**
Itens do orçamento (serviços/produtos).

**Campos:**
- `id_item` - ID sequencial
- `id_orcamento` - FK para orcamento_servico
- `ordem` - Número do item (1, 2, 3...)
- `descricao` - Descrição do item
- `valor_unitario` - Valor por unidade
- `quantidade` - Quantidade
- `valor_total` - Total do item

### **orcamento_rateio**
Divisão do orçamento entre cotistas.

**Campos:**
- `id_rateio` - ID sequencial
- `id_orcamento` - FK para orcamento_servico
- `cod_pessoa` - FK para Cliente
- `grupo_letra` - Código do grupo (A1, W2, etc)
- `qtd_cotas` - Quantidade de cotas
- `percentual` - % do rateio
- `valor_servico` - Valor do serviço
- `valor_taxa` - Valor da taxa
- `valor_cotista` - Total do cotista

### **orcamento_log**
Histórico completo de ações.

**Ações registradas:**
- ORCAMENTO_CRIADO
- ITEM_ADICIONADO
- ITEM_EDITADO
- ITEM_EXCLUIDO
- OBSERVACAO_PRIVADA
- ORCAMENTO_APROVADO
- RATEIO_DEFINIDO
- COBRANCA_GERADA
- ANEXO_ADICIONADO

### **orcamento_anexo**
Arquivos anexados ao orçamento.

**Campos:**
- `id_anexo` - ID sequencial
- `id_orcamento` - FK para orcamento_servico
- `nome_amigavel` - Nome exibido
- `nome_arquivo` - Nome técnico
- `url_arquivo` - URL no Vercel Blob
- `visivel_cliente` - true/false
- `tipo_arquivo` - Extensão
- `tamanho` - Bytes
- `usuario_upload` - LID ou telefone

---

## 🔄 FLUXO PRINCIPAL

### **1. Criação de Orçamento**

```
Menu → Criar orçamento
  ↓
Escolher embarcação
  ↓
Digite título
  ↓
Adicionar itens (descrição + valor)
  ↓
Revisar e confirmar
  ↓
✅ Orçamento criado (RASCUNHO)
```

### **2. Rateio Automático**

```
Ver detalhes → Definir rateio
  ↓
Sistema busca cotistas da embarcação
  ↓
Calcula divisão proporcional por cotas
  ↓
Exibe rateio com nomes dos cotistas
  ↓
Opções:
  1 - Confirmar e salvar
  2 - Outra distribuição (manual)
  0 - Cancelar
```

### **3. Rateio Manual**

```
Escolhe "2 - Outra distribuição"
  ↓
Sistema lista cotistas disponíveis
  ↓
Digite código (ex: E1)
  ↓
Digite valor para E1
  ↓
Sistema mostra resumo e saldo restante
  ↓
Repetir até atingir 100%
  ↓
✅ Confirmar e salvar
```

### **4. Aprovação**

```
Ver detalhes → Aprovar
  ↓
Verifica se tem rateio definido
  ↓
Altera status para APROVADO
  ↓
Registra data e usuário de aprovação
```

### **5. Geração de Cobrança**

```
Menu → Pendentes de cobrança
  ↓
Escolhe orçamento aprovado
  ↓
Sistema cria Contas a Receber para cada cotista
  ↓
Vencimento = Data atual + 30 dias
  ↓
Registra id_cobranca no orçamento
```

---

## 🔑 FUNCIONALIDADES IMPLEMENTADAS

### ✅ **Relacionamento de Cotistas (V.2610241635)**

**Problema resolvido:**
- Query usava relacionamento ERRADO entre tabelas
- Campo `Cod_Embarcacao` em P_BOAT_4_Autorizados armazena `Num_PB`, não `Código`

**Solução:**
```sql
FROM "P_BOAT_1_Embarcacao" e
INNER JOIN "P_BOAT_4_Autorizados" a
  ON e."Num_PB" = a."Cod_Embarcacao"  -- JOIN CORRETO
WHERE e."Código" = $1  -- ID da embarcação
  AND e."Cod_Cliente" = $2
  AND a."Dt_Desautorizacao" IS NULL
  AND a."Dt_Cancelamento" IS NULL
  AND a."Cod_Pessoa" NOT IN (3327, 4135, 4138, 3678)
```

**Resultado:** De 0 para 13 cotistas encontrados no teste!

---

### ✅ **Upload de Anexos (V.2610241620)**

**Problema resolvido:**
- Sistema travava ao enviar imagem/arquivo
- Não detectava mensagens de mídia

**Solução:**
- `server.js` passa objeto `msg` completo
- `orcamentos.js` processa `mensagemCompleta.message`
- Detecta: imageMessage, documentMessage, videoMessage, audioMessage

**Código:**
```javascript
// server.js linha 438
await processarMensagemOrcamentos(sock, remetente, grupoId, texto, msg)

// orcamentos.js
if (mensagemCompleta && mensagemCompleta.message) {
  const tipoMensagem = Object.keys(mensagemCompleta.message)[0];
  if (['imageMessage', 'documentMessage', ...].includes(tipoMensagem)) {
    await processarAnexoOrcamento(sock, userId, groupId, mensagemCompleta);
  }
}
```

---

### ✅ **Nomes no Rateio (V.2610241642)**

**Recurso:**
- Exibe nome do cotista ao lado da cota
- Mostra apenas os 2 primeiros nomes
- Facilita identificação visual

**Formato:**
```
A1 (1 cota) - FELIPE TAVARES
   R$ 2,83 (6.25%)

D1 (1 cota) - ALLEFE HENRIQUE
   R$ 2,83 (6.25%)
```

**Implementação:**
```javascript
// JOIN com tabela Cliente
LEFT JOIN "Cliente" c ON c."Codigo" = a."Cod_Pessoa"

// Extração dos 2 primeiros nomes
const partesNome = cot.nome_pessoa.trim().split(/\s+/);
nomeResumido = partesNome.slice(0, 2).join(' ').toUpperCase();
```

---

### ✅ **Distribuição Manual (V.2610241646)**

**Recurso:**
- Permite distribuir valor manualmente entre cotistas específicos
- Usuário escolhe quais cotistas e quanto cada um recebe

**Fluxo:**
1. Escolhe "2 - Outra distribuição"
2. Sistema lista cotistas disponíveis
3. Digite código (ex: E1)
4. Digite valor (ex: 25.50)
5. Sistema valida e mostra saldo restante
6. Repetir até atingir 100%
7. Salvar

**Validações:**
- ✅ Código deve existir na lista de cotistas
- ✅ Valor não pode exceder saldo restante
- ✅ Mesmo cotista não pode ser adicionado duas vezes
- ✅ Total deve atingir exatamente 100%

**Estados criados:**
- `DIST_MANUAL_CODIGO` - Aguardando código
- `DIST_MANUAL_VALOR` - Aguardando valor
- `CONFIRMAR_DIST_MANUAL` - Confirmar salvamento

**Funções:**
- `iniciarDistribuicaoManual()`
- `processarCodigoCotistaManual()`
- `processarValorCotistaManual()`

---

### ✅ **Melhorias na Exclusão de Itens (V.2610241607)**

**Recursos:**
- Confirmação antes de excluir
- Mantém usuário na tela de edição após exclusão
- LOG registra "Item #X excluído"

**Fluxo:**
```
Editar itens → Escolhe item → Excluir
  ↓
⚠️ Confirmar exclusão?
  ↓
1 - SIM / 0 - NÃO
  ↓
✅ Item excluído
  ↓
Volta para tela de edição (não menu)
```

---

### ✅ **Identificação de Usuários por LID (V.2610241551)**

**Recurso:**
- Decodifica LID para mostrar nome do usuário
- LOG mostra "USR: Adm_JDN_SM" em vez de "USR: 31796215899"

**Implementação:**
```javascript
if (usuario.includes('@lid')) {
  const result = await pool.query(`
    SELECT "Nome" FROM wpp_colaboradores
    WHERE "Lid" = $1 AND "Ativo" = 'S'
  `, [usuario]);
  
  if (result.rows.length > 0) {
    identificacao = result.rows[0].Nome;
  }
}
```

---

## 📝 PENDÊNCIAS

### **BAIXA PRIORIDADE:**

- [ ] Deletar anexo individual
- [ ] Editar observação privada
- [ ] Filtros avançados de consulta
- [ ] Exportação de relatórios
- [ ] Notificações de vencimento

---

## 🔧 ARQUIVOS PRINCIPAIS

### **wpp/comandos/orcamentos.js**
Arquivo principal com todas as funções.

**Versão atual:** V.2610241646

**Principais funções:**
- `mostrarMenuOrcamentos()` - Menu principal
- `criarOrcamento()` - Criação de orçamento
- `adicionarItemOrcamento()` - Adicionar item
- `editarItensOrcamento()` - Editar/excluir itens
- `definirRateioOrcamento()` - Rateio automático
- `iniciarDistribuicaoManual()` - Rateio manual
- `aprovarOrcamento()` - Aprovação
- `enviarCobrancaOrcamento()` - Gerar cobrança
- `processarAnexoOrcamento()` - Upload de anexos

### **wpp/server.js**
Servidor principal do bot.

**Linha 438:** Passa objeto `msg` completo para orçamentos

### **backup/**
Todos os backups com timestamp e cabeçalho documentado:
- `2610241620_server.js` - Bug upload anexos
- `2610241620_orcamentos.js` - Bug upload anexos
- `2610241635_orcamentos.js` - Relacionamento cotistas
- `2610241642_orcamentos.js` - Nomes no rateio
- `2610241646_orcamentos.js` - Distribuição manual

---

## 🎯 PRÓXIMOS PASSOS

1. **Testes em produção:**
   - Criar orçamento completo
   - Testar rateio automático
   - Testar rateio manual
   - Aprovar e gerar cobrança
   - Upload de anexos

2. **Monitoramento:**
   - Verificar LOGs de erro
   - Validar integridade das cobranças
   - Confirmar criação de Contas a Receber

3. **Melhorias futuras:**
   - Interface web para visualização
   - Envio de orçamento por email
   - Assinatura digital
   - Integração com Asaas (cobrança automática)

---

## 📚 HISTÓRICO DE VERSÕES

| Versão | Data | Descrição |
|--------|------|-----------|
| V.2610241646 | 24/10/26 16:46 | Distribuição manual de rateio |
| V.2610241642 | 24/10/26 16:42 | Nomes dos cotistas no rateio |
| V.2610241635 | 24/10/26 16:35 | Correção relacionamento cotistas |
| V.2610241620 | 24/10/26 16:20 | Correção bug upload anexos |
| V.2610241607 | 24/10/26 16:07 | Melhorias exclusão de itens |
| V.2610241603 | 24/10/26 16:03 | Rateio, aprovação e cobrança |
| V.2610241551 | 24/10/26 15:51 | Identificação por LID |
| V.2610241528 | 24/10/26 15:28 | Menu histórico e observações |

---

**Desenvolvido com Claude Sonnet 4.5**  
**Projeto:** Allmax Gestão de Cotas (Marujo⚓)

---

## V.2610241646
