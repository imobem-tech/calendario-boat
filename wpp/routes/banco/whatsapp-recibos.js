// ============================================================
// PROCESSAMENTO AVANÇADO DE RECIBOS - WHATSAPP
// V.260911220000
//
// FUNCIONALIDADES:
// 1. Ler imagem + comentário do usuário
// 2. Buscar no extrato
// 3. Se não achar → Forçar sync Sicredi → Retentar
// 4. Dúvidas → Perguntar no grupo
// 5. Múltiplas opções → Listar para escolha
// 6. Validar recibo (valor, descrição)
// 7. Salvar documento: pasta_empresa/yyyymmddhhmmss.jpg
// ============================================================

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Pool } = pg;

import { identificarEmpresaPorGrupo } from '../config/grupos-financeiros.js';
import { sincronizarSicredi } from './sicredi-sync.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Pasta base para documentos
const PASTA_DOCUMENTOS_BASE = process.env.PASTA_DOCUMENTOS || 'C:\\Users\\NOTEBOOK\\AppData\\Local\\Temp\\claude\\documentos';

// Estado de aguardo de respostas
const aguardandoResposta = new Map();
// Chave: grupoId
// Valor: { tipo, dados, timestamp }

/**
 * Processar recibo/mensagem no grupo financeiro
 */
export async function processarReciboWhatsApp(sock, mensagem, empresa) {
  try {
    const grupoId = mensagem.key.remoteJid;
    const remetente = mensagem.key.participant;

    // Verificar se está aguardando resposta
    if (aguardandoResposta.has(grupoId)) {
      await processarRespostaUsuario(sock, mensagem, grupoId, empresa);
      return;
    }

    const tipo = Object.keys(mensagem.message || {})[0];

    // IMAGEM: Processar recibo
    if (tipo === 'imageMessage') {
      const comentario = mensagem.message.imageMessage?.caption || '';
      await processarImagemRecibo(sock, mensagem, grupoId, empresa, comentario, remetente);
    }

    // TEXTO: Pode ser descrição de um gasto
    else if (tipo === 'conversation' || tipo === 'extendedTextMessage') {
      const texto = mensagem.message.conversation ||
                   mensagem.message.extendedTextMessage?.text || '';

      await processarTextoLancamento(sock, grupoId, empresa, texto, remetente);
    }

  } catch (err) {
    console.error('❌ Erro ao processar recibo:', err);
  }
}

/**
 * PASSO 1: Processar imagem de recibo
 */
async function processarImagemRecibo(sock, mensagem, grupoId, empresa, comentario, remetente) {
  try {
    console.log(`📷 Processando recibo de ${empresa}`);

    // 1. Baixar imagem
    const buffer = await downloadMediaMessage(
      mensagem,
      'buffer',
      {},
      { logger: console, reuploadRequest: sock.updateMediaMessage }
    );

    // 2. Enviar para Claude Vision
    const base64Image = buffer.toString('base64');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4.5-20251022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: `Analise este recibo/nota fiscal e extraia os dados em JSON:

{
  "valor": número (apenas números, sem R$ ou pontos/vírgulas),
  "data": "YYYY-MM-DD",
  "fornecedor": "nome do fornecedor",
  "cnpj": "CNPJ se tiver",
  "descricao": "descrição do produto/serviço",
  "categoria_sugerida": "categoria (ex: Combustível, Alimentação, etc.)",
  "itens": ["item 1", "item 2"]
}

Se houver comentário do usuário, considere: "${comentario}"

Responda APENAS com o JSON.`
          }
        ]
      }]
    });

    const dadosExtraidos = JSON.parse(response.content[0].text);
    console.log('✅ Dados extraídos:', dadosExtraidos);

    // 3. BUSCAR NO EXTRATO
    const resultado = await buscarEClassificar(sock, grupoId, empresa, dadosExtraidos, buffer, remetente);

    if (!resultado.sucesso) {
      // Se não encontrou, vamos forçar sync Sicredi
      await tentarComSyncSicredi(sock, grupoId, empresa, dadosExtraidos, buffer, remetente);
    }

  } catch (err) {
    console.error('❌ Erro ao processar imagem:', err);
    await sock.sendMessage(grupoId, {
      text: `❌ Erro ao processar recibo: ${err.message}`
    });
  }
}

/**
 * PASSO 2: Buscar no extrato e classificar
 */
async function buscarEClassificar(sock, grupoId, empresa, dados, buffer, remetente) {
  try {
    // Buscar no extrato (±5% valor, ±3 dias)
    const lancamentos = await buscarNoExtrato(empresa, dados.valor, dados.data);

    // NENHUM ENCONTRADO
    if (lancamentos.length === 0) {
      return { sucesso: false, motivo: 'nao_encontrado' };
    }

    // EXATAMENTE 1 ENCONTRADO
    if (lancamentos.length === 1) {
      // Validar recibo antes de classificar
      const validacao = validarRecibo(dados, lancamentos[0]);

      if (validacao.valido) {
        // Salvar documento
        const nomeArquivo = await salvarDocumento(empresa, buffer, 'jpg');

        // Classificar
        await classificarLancamento(lancamentos[0].id, dados, nomeArquivo, remetente);

        await sock.sendMessage(grupoId, {
          text: `✅ *Recibo processado e classificado!*

📋 *Dados do recibo:*
💰 Valor: R$ ${dados.valor.toFixed(2)}
📅 Data: ${dados.data}
🏪 Fornecedor: ${dados.fornecedor || 'N/A'}
🔖 Categoria: ${dados.categoria_sugerida}

✓ Lançamento #${lancamentos[0].id} classificado automaticamente.
📎 Documento salvo: ${nomeArquivo}`
        });

        return { sucesso: true };

      } else {
        // Validação falhou - perguntar ao usuário
        await perguntarConfirmacao(sock, grupoId, validacao.motivo, dados, lancamentos[0]);
        return { sucesso: false, motivo: 'aguardando_confirmacao' };
      }
    }

    // MÚLTIPLOS ENCONTRADOS
    if (lancamentos.length > 1) {
      await apresentarOpcoes(sock, grupoId, dados, lancamentos, buffer, remetente);
      return { sucesso: false, motivo: 'multiplos' };
    }

  } catch (err) {
    console.error('❌ Erro ao buscar e classificar:', err);
    return { sucesso: false, motivo: 'erro', erro: err.message };
  }
}

/**
 * PASSO 3: Se não encontrou, forçar sync Sicredi e retentar
 */
async function tentarComSyncSicredi(sock, grupoId, empresa, dados, buffer, remetente) {
  try {
    await sock.sendMessage(grupoId, {
      text: `⏳ Lançamento não encontrado no extrato.
Sincronizando Sicredi...`
    });

    // Forçar sincronização Sicredi
    await sincronizarSicredi(null, null);

    // Aguardar 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));

    // RETENTAR busca
    const resultado = await buscarEClassificar(sock, grupoId, empresa, dados, buffer, remetente);

    if (!resultado.sucesso) {
      // Ainda não encontrou
      await sock.sendMessage(grupoId, {
        text: `⚠️ *Lançamento não encontrado*

📋 *Dados do recibo:*
💰 Valor: R$ ${dados.valor.toFixed(2)}
📅 Data: ${dados.data}
🏪 Fornecedor: ${dados.fornecedor || 'N/A'}

O lançamento ainda não apareceu no extrato bancário.

💡 *Opções:*
1. Aguardar compensação bancária
2. Verificar se o valor/data estão corretos
3. Salvar como pendente para classificar depois`
      });
    }

  } catch (err) {
    console.error('❌ Erro ao sincronizar Sicredi:', err);
  }
}

/**
 * PASSO 4: Apresentar múltiplas opções para escolha
 */
async function apresentarOpcoes(sock, grupoId, dados, lancamentos, buffer, remetente) {
  try {
    let msg = `❓ *Encontrei ${lancamentos.length} lançamentos similares*\n\n`;
    msg += `📋 *Recibo:*\n`;
    msg += `💰 R$ ${dados.valor.toFixed(2)}\n`;
    msg += `📅 ${dados.data}\n`;
    msg += `🏪 ${dados.fornecedor}\n\n`;
    msg += `*Qual desses é o correto?*\n\n`;

    lancamentos.forEach((lanc, i) => {
      const numero = i + 1;
      const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][i] || `${numero}️⃣`;
      msg += `${emoji} ${lanc.data} - ${lanc.banco} - R$ ${Math.abs(lanc.valor).toFixed(2)}\n`;
      msg += `   ${lanc.descricao_original}\n\n`;
    });

    msg += `*Responda com o número (1, 2, 3...)*`;

    await sock.sendMessage(grupoId, { text: msg });

    // Guardar estado
    aguardandoResposta.set(grupoId, {
      tipo: 'escolha_lancamento',
      dados: dados,
      lancamentos: lancamentos,
      buffer: buffer,
      remetente: remetente,
      timestamp: Date.now()
    });

  } catch (err) {
    console.error('❌ Erro ao apresentar opções:', err);
  }
}

/**
 * PASSO 5: Processar resposta do usuário
 */
async function processarRespostaUsuario(sock, mensagem, grupoId, empresa) {
  try {
    const texto = (
      mensagem.message?.conversation ||
      mensagem.message?.extendedTextMessage?.text ||
      ''
    ).trim();

    const estado = aguardandoResposta.get(grupoId);

    if (!estado) return;

    // ESCOLHA DE LANÇAMENTO (1, 2, 3...)
    if (estado.tipo === 'escolha_lancamento') {
      const escolha = parseInt(texto);

      if (isNaN(escolha) || escolha < 1 || escolha > estado.lancamentos.length) {
        await sock.sendMessage(grupoId, {
          text: `❌ Opção inválida. Responda com um número de 1 a ${estado.lancamentos.length}.`
        });
        return;
      }

      const lancamentoEscolhido = estado.lancamentos[escolha - 1];

      // Salvar documento
      const nomeArquivo = await salvarDocumento(empresa, estado.buffer, 'jpg');

      // Classificar
      await classificarLancamento(
        lancamentoEscolhido.id,
        estado.dados,
        nomeArquivo,
        estado.remetente
      );

      await sock.sendMessage(grupoId, {
        text: `✅ *Lançamento classificado!*

💰 R$ ${Math.abs(lancamentoEscolhido.valor).toFixed(2)}
📅 ${lancamentoEscolhido.data}
🔖 ${estado.dados.categoria_sugerida}
📎 Documento: ${nomeArquivo}`
      });

      // Limpar estado
      aguardandoResposta.delete(grupoId);
    }

  } catch (err) {
    console.error('❌ Erro ao processar resposta:', err);
    aguardandoResposta.delete(grupoId);
  }
}

/**
 * Buscar no extrato bancário
 */
async function buscarNoExtrato(empresa, valor, data) {
  const valorMin = valor * 0.95;
  const valorMax = valor * 1.05;

  const dataRef = new Date(data);
  const dataMin = new Date(dataRef);
  dataMin.setDate(dataMin.getDate() - 3);
  const dataMax = new Date(dataRef);
  dataMax.setDate(dataMax.getDate() + 3);

  const resultado = await pool.query(`
    SELECT id, empresa, banco, data, descricao_original, valor, classificacao
    FROM bank_extratos
    WHERE empresa = $1
      AND ABS(valor) BETWEEN $2 AND $3
      AND data BETWEEN $4 AND $5
      AND classificacao IS NULL
    ORDER BY ABS(ABS(valor) - $6), ABS(data - $7::date)
    LIMIT 5
  `, [empresa, valorMin, valorMax, dataMin, dataMax, valor, data]);

  return resultado.rows;
}

/**
 * Validar recibo (valor, descrição vs itens)
 */
function validarRecibo(dadosRecibo, lancamento) {
  // Verificar diferença de valor
  const diferencaValor = Math.abs(Math.abs(lancamento.valor) - dadosRecibo.valor);
  const percentualDiferenca = (diferencaValor / dadosRecibo.valor) * 100;

  if (percentualDiferenca > 5) {
    return {
      valido: false,
      motivo: `Valor do recibo (R$ ${dadosRecibo.valor.toFixed(2)}) difere ${percentualDiferenca.toFixed(1)}% do extrato (R$ ${Math.abs(lancamento.valor).toFixed(2)})`
    };
  }

  // TODO: Validar descrição vs itens (quando tiver mais lógica)

  return { valido: true };
}

/**
 * Perguntar confirmação ao usuário
 */
async function perguntarConfirmacao(sock, grupoId, motivo, dados, lancamento) {
  const msg = `⚠️ *Confirmação necessária*

${motivo}

📋 *Recibo:*
💰 R$ ${dados.valor.toFixed(2)}
🏪 ${dados.fornecedor}

📊 *Extrato:*
💰 R$ ${Math.abs(lancamento.valor).toFixed(2)}
📝 ${lancamento.descricao_original}

*Confirmar mesmo assim?* (S/N)`;

  await sock.sendMessage(grupoId, { text: msg });

  aguardandoResposta.set(grupoId, {
    tipo: 'confirmacao',
    dados: dados,
    lancamento: lancamento,
    timestamp: Date.now()
  });
}

/**
 * Salvar documento na pasta da empresa
 */
async function salvarDocumento(empresa, buffer, extensao) {
  try {
    // Criar pasta da empresa se não existir
    const pastaEmpresa = path.join(PASTA_DOCUMENTOS_BASE, empresa);
    if (!fs.existsSync(pastaEmpresa)) {
      fs.mkdirSync(pastaEmpresa, { recursive: true });
    }

    // Gerar nome do arquivo: yyyymmddhhmmss.jpg
    const agora = new Date();
    const nomeArquivo = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}${String(agora.getSeconds()).padStart(2, '0')}.${extensao}`;

    const caminhoCompleto = path.join(pastaEmpresa, nomeArquivo);

    // Salvar arquivo
    fs.writeFileSync(caminhoCompleto, buffer);

    console.log(`📎 Documento salvo: ${caminhoCompleto}`);

    return nomeArquivo;

  } catch (err) {
    console.error('❌ Erro ao salvar documento:', err);
    return null;
  }
}

/**
 * Classificar lançamento
 */
async function classificarLancamento(extratoId, dados, nomeArquivo, remetente) {
  await pool.query(`
    UPDATE bank_extratos
    SET
      classificacao = $2,
      classificacao_manual = true,
      classificado_por = $3,
      classificado_em = NOW(),
      confianca = 0.95,
      campos_extras = jsonb_set(
        COALESCE(campos_extras, '{}'),
        '{dados_recibo}',
        $4::jsonb
      )
    WHERE id = $1
  `, [
    extratoId,
    dados.categoria_sugerida,
    `WhatsApp - ${remetente}`,
    JSON.stringify({
      fornecedor: dados.fornecedor,
      descricao: dados.descricao,
      cnpj: dados.cnpj,
      itens: dados.itens,
      documento: nomeArquivo
    })
  ]);

  // Histórico
  await pool.query(`
    INSERT INTO bank_historico_classificacoes
      (extrato_id, classificacao_nova, classificado_por, observacao)
    VALUES ($1, $2, $3, $4)
  `, [
    extratoId,
    dados.categoria_sugerida,
    `WhatsApp - ${remetente}`,
    `Classificado via grupo WhatsApp. Documento: ${nomeArquivo}`
  ]);
}

/**
 * Processar texto de lançamento
 */
async function processarTextoLancamento(sock, grupoId, empresa, texto, remetente) {
  // TODO: Implementar processamento de texto
  // Similar ao de imagem, mas extrai dados do texto
}

// ============================================================
// EXPORTAÇÕES
// ============================================================

export default processarReciboWhatsApp;

// ============================================================
// FIM
// ============================================================
