# 🚧 DESENVOLVIMENTO DO SISTEMA DE ANEXOS - ORÇAMENTOS

**Versão:** V.2610241540  
**Data Início:** 24/10/2026  
**Status:** EM ANDAMENTO

---

## 📋 CONTEXTO

Implementação do sistema de anexos para orçamentos via WhatsApp, seguindo o mesmo modelo usado nos **extratos bancários**.

---

## ✅ O QUE JÁ FOI IMPLEMENTADO

### **1. Submenu de HISTÓRICO transformado (V.2610241528)**

Anteriormente: Clicar em "Acessar HISTÓRICO" mostrava direto o LOG.

Agora: Mostra um submenu com 4 opções:

```
━━━━━━━━━━━━━━━━
📋 HISTÓRICO E ANEXOS
━━━━━━━━━━━━━━━━
🆔 ORC-2610241430
📝 Manutenção preventiva do motor
🚤 PB-002
━━━━━━━━━━━━━━━━

OPÇÕES:

1️⃣ 📜 Ver LOG (histórico)
2️⃣ 📝 Registrar observação privada
3️⃣ 📎 Inserir anexo
4️⃣ 📂 Ver anexos
0️⃣ 🔙 Voltar
```

**Arquivo:** `wpp/comandos/orcamentos.js`  
**Função:** `mostrarMenuHistorico()`  
**Estado:** `MENU_HISTORICO`

---

### **2. Observações Privadas Funcionando (V.2610241528)**

Fluxo completo implementado:

1. Usuário escolhe opção 2
2. Sistema pede: "Digite a observação"
3. Usuário digita texto livre
4. Sistema salva como LOG tipo `OBSERVACAO_PRIVADA`
5. Confirmação e retorno ao menu

**Função:** Integrada no processador principal  
**Estado:** `REGISTRAR_OBSERVACAO`  
**LOG:** Tabela `orcamento_log` com ação `OBSERVACAO_PRIVADA`

---

### **3. Estrutura SQL Completa (V.2610241535)**

**Arquivo:** `sql/criar_tabela_orcamento_anexo.sql`

```sql
CREATE TABLE IF NOT EXISTS orcamento_anexo (
  id_anexo SERIAL PRIMARY KEY,
  id_orcamento INTEGER NOT NULL REFERENCES orcamento_servico(id_orcamento) ON DELETE CASCADE,
  nome_amigavel VARCHAR(255) NOT NULL,      -- Nome dado pelo usuário
  nome_arquivo VARCHAR(500) NOT NULL,        -- Nome técnico no storage
  url_arquivo TEXT NOT NULL,                 -- URL do Vercel Blob
  visivel_cliente BOOLEAN DEFAULT true,      -- true = cliente vê, false = só gestores
  tipo_arquivo VARCHAR(50),                  -- Extensão/MIME type
  tamanho INTEGER,                           -- Bytes
  data_upload TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo'),
  usuario_upload VARCHAR(50)                 -- Telefone WhatsApp (11 dígitos)
);
```

**Índices:**
- `idx_orcamento_anexo_orcamento` (busca por orçamento)
- `idx_orcamento_anexo_visivel` (filtro visibilidade)

**Status:** SQL criado, TABELA AINDA NÃO EXECUTADA NO BANCO

---

## ⏳ O QUE FALTA IMPLEMENTAR

### **FASE 1: Funções Base**

#### **A) Processar Anexo do WhatsApp**

```javascript
async function processarAnexoOrcamento(sock, userId, groupId, mensagem) {
  // 1. Detectar tipo de mídia (image, document, video, audio, etc)
  // 2. Baixar mídia com downloadMediaMessage() do Baileys
  // 3. Armazenar buffer temporariamente no estado
  // 4. Pedir nome amigável ao usuário
  // 5. Transição para estado AGUARDANDO_NOME_ANEXO
}
```

**Referência:** `wpp/routes/banco/whatsapp-recibos.js` linhas 79-147

---

#### **B) Solicitar Nome Amigável**

```javascript
async function solicitarNomeAnexo(sock, userId, groupId, estado) {
  const mensagem = `📎 *NOME DO ANEXO*
━━━━━━━━━━━━━━━━

Arquivo recebido! 

Digite um nome amigável para este anexo:

💡 Exemplo: "Orçamento fornecedor XYZ", "Foto do problema"

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });
  
  atualizarEstado(userId, {
    ...estado,
    etapa: 'AGUARDANDO_NOME_ANEXO'
  });
}
```

---

#### **C) Solicitar Visibilidade**

```javascript
async function solicitarVisibilidadeAnexo(sock, userId, groupId, estado, nomeAnexo) {
  const mensagem = `👁️ *VISIBILIDADE DO ANEXO*
━━━━━━━━━━━━━━━━

📎 ${nomeAnexo}

Este anexo será visível para o cliente?

1️⃣ 👁️ SIM - Cliente pode ver
2️⃣ 🔒 NÃO - Apenas gestores

0️⃣ Cancelar`;

  await sock.sendMessage(groupId, { text: mensagem });
  
  atualizarEstado(userId, {
    ...estado,
    etapa: 'AGUARDANDO_VISIBILIDADE_ANEXO',
    nome_anexo: nomeAnexo
  });
}
```

---

#### **D) Upload para Vercel Blob**

```javascript
import { put } from '@vercel/blob';

async function uploadAnexoBlob(buffer, idOrcamento, nomeOriginal) {
  const timestamp = Date.now();
  const extensao = nomeOriginal.split('.').pop();
  const nomeArquivo = `orc_${idOrcamento}_${timestamp}.${extensao}`;
  const blobPath = `orcamentos/${idOrcamento}/${nomeArquivo}`;

  const blob = await put(blobPath, buffer, {
    access: 'public',
    addRandomSuffix: false
  });

  return {
    url: blob.url,
    nome_arquivo: nomeArquivo,
    tamanho: buffer.length,
    tipo_arquivo: extensao
  };
}
```

**Referência:** `wpp/routes/banco/recibos-api.js` linhas 220-234

---

#### **E) Salvar no Banco**

```javascript
async function salvarAnexoBanco(idOrcamento, dados, userId) {
  try {
    // Limpar telefone
    let telefone = userId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (telefone.length > 11) {
      telefone = telefone.slice(-11);
    }

    const result = await pool.query(`
      INSERT INTO orcamento_anexo (
        id_orcamento,
        nome_amigavel,
        nome_arquivo,
        url_arquivo,
        visivel_cliente,
        tipo_arquivo,
        tamanho,
        usuario_upload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id_anexo
    `, [
      idOrcamento,
      dados.nome_amigavel,
      dados.nome_arquivo,
      dados.url_arquivo,
      dados.visivel_cliente,
      dados.tipo_arquivo,
      dados.tamanho,
      telefone
    ]);

    // Adicionar LOG
    await adicionarLog(
      idOrcamento,
      'ANEXO_ADICIONADO',
      `${dados.nome_amigavel} (${dados.visivel_cliente ? 'Visível' : 'Privado'})`,
      userId
    );

    return result.rows[0].id_anexo;

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao salvar anexo:', error);
    throw error;
  }
}
```

---

#### **F) Listar Anexos**

```javascript
async function listarAnexosOrcamento(sock, userId, groupId, idOrcamento) {
  try {
    const result = await pool.query(`
      SELECT
        id_anexo,
        nome_amigavel,
        nome_arquivo,
        url_arquivo,
        visivel_cliente,
        tipo_arquivo,
        tamanho,
        data_upload,
        usuario_upload
      FROM orcamento_anexo
      WHERE id_orcamento = $1
      ORDER BY data_upload DESC
    `, [idOrcamento]);

    if (result.rows.length === 0) {
      await sock.sendMessage(groupId, {
        text: `📂 *ANEXOS*
━━━━━━━━━━━━━━━━

⚠️ Nenhum anexo encontrado.

━━━━━━━━━━━━━━━━
Digite 0 para voltar.`
      });
      
      atualizarEstado(userId, {
        etapa: 'VER_ANEXOS_VAZIO',
        id_orcamento: idOrcamento
      });
      return;
    }

    let mensagem = `📂 *ANEXOS*
━━━━━━━━━━━━━━━━
🆔 Orçamento: #${idOrcamento}
📎 Total: ${result.rows.length}
━━━━━━━━━━━━━━━━

`;

    result.rows.forEach((anexo, index) => {
      const data = new Date(anexo.data_upload).toLocaleDateString('pt-BR');
      const visibilidade = anexo.visivel_cliente ? '👁️ Visível' : '🔒 Privado';
      const tamanhoKB = (anexo.tamanho / 1024).toFixed(1);

      mensagem += `${index + 1}️⃣ ${anexo.nome_amigavel}
   ${visibilidade} | ${tamanhoKB} KB
   📅 ${data}
   🔗 ${anexo.url_arquivo}

`;
    });

    mensagem += `━━━━━━━━━━━━━━━━
Digite o número para opções
ou 0 para voltar.`;

    await sock.sendMessage(groupId, { text: mensagem });

    atualizarEstado(userId, {
      etapa: 'VER_ANEXOS',
      id_orcamento: idOrcamento,
      anexos: result.rows
    });

  } catch (error) {
    console.error('❌ [ORCAMENTOS] Erro ao listar anexos:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao listar anexos.\n\n${error.message}`
    });
  }
}
```

---

### **FASE 2: Integração no Processador**

#### **Localização:** `wpp/comandos/orcamentos.js` linha ~2229

```javascript
// Menu de histórico e anexos
if (estado.etapa === 'MENU_HISTORICO') {
  if (texto === '0') {
    await verDetalhesOrcamento(sock, userId, groupId, estado.id_orcamento);
    return;
  }

  switch (texto) {
    case '1': // Ver LOG
      await mostrarHistoricoOrcamento(sock, userId, groupId, estado.id_orcamento);
      break;

    case '2': // Registrar observação
      // ... JÁ IMPLEMENTADO
      break;

    case '3': // Inserir anexo
      await iniciarInsercaoAnexo(sock, userId, groupId, estado);
      break;

    case '4': // Ver anexos
      await listarAnexosOrcamento(sock, userId, groupId, estado.id_orcamento);
      break;

    default:
      await sock.sendMessage(groupId, {
        text: '❌ Opção inválida! Digite 1, 2, 3, 4 ou 0.'
      });
  }
  return;
}
```

#### **Função Iniciar Inserção:**

```javascript
async function iniciarInsercaoAnexo(sock, userId, groupId, estado) {
  await sock.sendMessage(groupId, {
    text: `📎 *INSERIR ANEXO*
━━━━━━━━━━━━━━━━

Envie o arquivo que deseja anexar ao orçamento:

📷 Foto
📄 Documento (PDF, Word, etc)
🎥 Vídeo
🎵 Áudio

0️⃣ Cancelar`
  });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'AGUARDANDO_ANEXO'
  });
}
```

---

### **FASE 3: Handler de Mídia**

#### **Localização:** Adicionar no início do processador

```javascript
export async function processarMensagemOrcamentos(sock, userId, groupId, mensagem) {
  const estado = obterEstado(userId);
  
  // PROCESSAR MÍDIA (antes de processar texto)
  if (estado.etapa === 'AGUARDANDO_ANEXO') {
    const tipoMensagem = Object.keys(mensagem.message || {})[0];
    
    if (['imageMessage', 'documentMessage', 'videoMessage', 'audioMessage'].includes(tipoMensagem)) {
      await processarAnexoOrcamento(sock, userId, groupId, mensagem);
      return;
    }
  }
  
  const texto = mensagem.trim();
  
  // ... resto do processador
}
```

---

### **FASE 4: Estados Adicionais**

Adicionar handlers para:

```javascript
// Estado: AGUARDANDO_NOME_ANEXO
if (estado.etapa === 'AGUARDANDO_NOME_ANEXO') {
  if (texto === '0') {
    await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
    return;
  }
  
  await solicitarVisibilidadeAnexo(sock, userId, groupId, estado, texto);
  return;
}

// Estado: AGUARDANDO_VISIBILIDADE_ANEXO
if (estado.etapa === 'AGUARDANDO_VISIBILIDADE_ANEXO') {
  if (texto === '0') {
    await mostrarMenuHistorico(sock, userId, groupId, estado.id_orcamento);
    return;
  }
  
  if (texto === '1' || texto === '2') {
    const visivelCliente = texto === '1';
    await finalizarUploadAnexo(sock, userId, groupId, estado, visivelCliente);
    return;
  }
  
  await sock.sendMessage(groupId, {
    text: '❌ Opção inválida! Digite 1 (Visível) ou 2 (Privado).'
  });
  return;
}
```

---

## 🔧 IMPORTS NECESSÁRIOS

No topo do arquivo `orcamentos.js`:

```javascript
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { put } from '@vercel/blob';
```

---

## 📊 CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Executar SQL no banco (criar tabela orcamento_anexo)
- [ ] Adicionar imports (downloadMediaMessage, put)
- [ ] Implementar `processarAnexoOrcamento()`
- [ ] Implementar `solicitarNomeAnexo()`
- [ ] Implementar `solicitarVisibilidadeAnexo()`
- [ ] Implementar `uploadAnexoBlob()`
- [ ] Implementar `salvarAnexoBanco()`
- [ ] Implementar `listarAnexosOrcamento()`
- [ ] Implementar `iniciarInsercaoAnexo()`
- [ ] Implementar `finalizarUploadAnexo()`
- [ ] Integrar case '3' no MENU_HISTORICO
- [ ] Integrar case '4' no MENU_HISTORICO
- [ ] Adicionar handler de mídia no início do processador
- [ ] Adicionar estado AGUARDANDO_ANEXO
- [ ] Adicionar estado AGUARDANDO_NOME_ANEXO
- [ ] Adicionar estado AGUARDANDO_VISIBILIDADE_ANEXO
- [ ] Adicionar estado VER_ANEXOS
- [ ] Testar upload de imagem
- [ ] Testar upload de PDF
- [ ] Testar listagem
- [ ] Atualizar versão V.26yyMMddHHmm

---

## 📝 NOTAS IMPORTANTES

1. **Vercel Blob:** Usar variável de ambiente `BLOB_READ_WRITE_TOKEN`
2. **Tamanho máximo:** Definir limite (ex: 5MB como nos extratos)
3. **Tipos aceitos:** image/*, application/pdf, video/*, audio/*
4. **LOG:** Sempre registrar ANEXO_ADICIONADO e ANEXO_REMOVIDO
5. **Telefone:** Sempre limpar e pegar últimos 11 dígitos
6. **Timestamp:** America/Sao_Paulo em todas as datas

---

## 🚀 DEPLOY

Após implementação completa:

```bash
git add .
git commit -m "feat(orcamentos): Sistema completo de anexos - V.26yyMMddHHmm"
git push origin main
```

Railway fará deploy automático.

---

**Última Atualização:** 24/10/2026 15:40  
**Próximo Passo:** Corrigir erro menu 6 → Implementar funções de anexo

---

## V.2610241540
