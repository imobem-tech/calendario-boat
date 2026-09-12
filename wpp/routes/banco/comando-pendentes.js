// ============================================================
// wpp/routes/banco/comando-pendentes.js — V.260912083000
// COMANDO WHATSAPP: lll (LANÇAMENTOS PENDENTES)
// Fluxo interativo de classificação de lançamentos bancários
// FUNCIONA APENAS EM GRUPOS FINANCEIROS AUTORIZADOS
// FILTRA PENDENTES POR EMPRESA DO GRUPO
// ORDEM INTELIGENTE: Base + Boost por uso (Híbrido)
// ✅ STORAGE PERMANENTE: Vercel Blob (migrado do Railway ephemeral)
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;
import { isGrupoFinanceiro, identificarEmpresaPorGrupo } from '../../config/grupos-financeiros.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { put } from '@vercel/blob';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Controle de sessões interativas (exportado para server.js verificar etapa)
export const sessoesAtivas = new Map(); // grupoId → { etapa, dados }

/**
 * Verifica se é comando lll (Lançamentos pendentes)
 */
export function ehComandoPendentes(texto) {
  return /^lll$/i.test(texto.trim());
}

/**
 * Lista lançamentos pendentes
 */
export async function listarPendentes(sock, grupoId) {
  try {
    // ⚠️ VERIFICAR SE É GRUPO FINANCEIRO
    if (!isGrupoFinanceiro(grupoId)) {
      console.log(`⛔ Tentativa de usar ppp em grupo não autorizado: ${grupoId}`);
      return; // Ignora silenciosamente
    }

    // Identificar empresa do grupo
    const empresa = identificarEmpresaPorGrupo(grupoId);

    if (!empresa) {
      console.log(`⚠️ Grupo financeiro sem empresa identificada: ${grupoId}`);
      await sock.sendMessage(grupoId, {
        text: '⚠️ Grupo financeiro não configurado. Contate o administrador.'
      });
      return;
    }

    console.log(`📋 Listando pendentes para ${empresa} (grupo: ${grupoId})`);

    // Buscar total de pendentes DA EMPRESA
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM bank_extratos
      WHERE status_classificacao = 'PENDENTE'
        AND empresa = $1
    `, [empresa]);

    const total = parseInt(totalResult.rows[0].total);

    if (total === 0) {
      await sock.sendMessage(grupoId, {
        text: `✅ *NENHUM LANÇAMENTO PENDENTE - ${empresa}*\n\nTodos os lançamentos foram classificados!`
      });
      return;
    }

    // Buscar 3 mais recentes DA EMPRESA
    const result = await pool.query(`
      SELECT
        id,
        empresa,
        banco,
        data,
        valor,
        tipo,
        descricao_original,
        cpf_cnpj_origem,
        observacoes,
        importado_em
      FROM bank_extratos
      WHERE status_classificacao = 'PENDENTE'
        AND empresa = $1
      ORDER BY importado_em DESC
      LIMIT 3
    `, [empresa]);

    const pendentes = result.rows;
    const mostrados = pendentes.length;

    // Montar mensagem
    let mensagem = `📋 *LANÇAMENTOS PENDENTES (${mostrados}/${total})*\n\n`;

    pendentes.forEach((lanc, index) => {
      const numero = index + 1;
      const dataFormatada = new Date(lanc.data).toLocaleDateString('pt-BR');
      const valorFormatado = Math.abs(parseFloat(lanc.valor)).toFixed(2);

      mensagem += `${numero} ━━━━━━━━━━━━━━━━\n`;
      mensagem += `R$ ${valorFormatado} - ${lanc.tipo === 'CREDITO' ? 'Recebido' : 'Pago'} - ${dataFormatada}\n`;
      mensagem += `   🏢 ${lanc.empresa} | ${lanc.banco}\n`;
      mensagem += `   📝 ${lanc.descricao_original}\n`;

      if (lanc.cpf_cnpj_origem) {
        mensagem += `   👤 CPF/CNPJ: ${lanc.cpf_cnpj_origem}\n`;
      } else {
        mensagem += `   ⚠️ CPF/CNPJ: não identificado\n`;
      }

      if (lanc.observacoes) {
        mensagem += `   💬 ${lanc.observacoes}\n`;
      }

      mensagem += '\n';
    });

    mensagem += '━━━━━━━━━━━━━━━━\n';
    mensagem += '✏️ *Responda o número (1, 2 ou 3) para classificar*';

    await sock.sendMessage(grupoId, { text: mensagem });

    // Salvar sessão
    sessoesAtivas.set(grupoId, {
      etapa: 'AGUARDANDO_NUMERO',
      pendentes: pendentes,
      timestamp: Date.now()
    });

    // Limpar sessão após 5 minutos
    setTimeout(() => {
      if (sessoesAtivas.get(grupoId)?.timestamp === sessoesAtivas.get(grupoId)?.timestamp) {
        sessoesAtivas.delete(grupoId);
      }
    }, 5 * 60 * 1000);

  } catch (err) {
    console.error('❌ Erro ao listar pendentes:', err);
    await sock.sendMessage(grupoId, {
      text: '❌ Erro ao buscar lançamentos pendentes. Tente novamente.'
    });
  }
}

/**
 * Processa resposta do usuário (etapa do fluxo)
 * @param {Object} mensagem - Mensagem completa do Baileys (para receber arquivos)
 */
export async function processarRespostaPendente(sock, grupoId, remetente, texto, mensagem = null) {
  const sessao = sessoesAtivas.get(grupoId);
  if (!sessao) return false;

  try {
    switch (sessao.etapa) {
      case 'AGUARDANDO_NUMERO':
        return await processarNumeroEscolhido(sock, grupoId, remetente, texto, sessao);

      case 'AGUARDANDO_CATEGORIA':
        return await processarCategoriaEscolhida(sock, grupoId, remetente, texto, sessao);

      case 'AGUARDANDO_OBSERVACAO':
        return await processarObservacao(sock, grupoId, remetente, texto, sessao);

      case 'AGUARDANDO_RECIBO':
        return await processarRecibo(sock, grupoId, remetente, mensagem, sessao);

      case 'AGUARDANDO_CONFIRMACAO':
        return await processarConfirmacao(sock, grupoId, remetente, texto, sessao);

      default:
        return false;
    }
  } catch (err) {
    console.error('❌ Erro ao processar resposta:', err);
    await sock.sendMessage(grupoId, {
      text: '❌ Erro ao processar resposta. Tente novamente com *lll*.'
    });
    sessoesAtivas.delete(grupoId);
    return true;
  }
}

/**
 * Processa número escolhido (1, 2 ou 3)
 */
async function processarNumeroEscolhido(sock, grupoId, remetente, texto, sessao) {
  const numero = parseInt(texto.trim());

  if (isNaN(numero) || numero < 1 || numero > 3) {
    await sock.sendMessage(grupoId, {
      text: '⚠️ Número inválido. Responda 1, 2 ou 3.'
    });
    return true;
  }

  const lancamento = sessao.pendentes[numero - 1];
  if (!lancamento) {
    await sock.sendMessage(grupoId, {
      text: '⚠️ Lançamento não encontrado. Use *lll* para ver a lista novamente.'
    });
    sessoesAtivas.delete(grupoId);
    return true;
  }

  // Buscar categorias da empresa (ORDEM INTELIGENTE + FILTRO POR TIPO)
  // Se lançamento é CREDITO → só mostra categorias CREDITO
  // Se lançamento é DEBITO → só mostra categorias DEBITO
  // Mostra: categorias da EMPRESA específica + categorias TODAS (comuns)
  const categorias = await pool.query(`
    SELECT id, nome, tipo, icone, ordem, vezes_usada, empresa,
           (ordem - (vezes_usada::float / 10)) as ordem_dinamica
    FROM bank_categorias
    WHERE (empresa = $1 OR empresa = 'TODAS')
      AND ativo = true
      AND tipo = $2
    ORDER BY ordem_dinamica, nome
  `, [lancamento.empresa, lancamento.tipo]);

  if (categorias.rows.length === 0) {
    await sock.sendMessage(grupoId, {
      text: `⚠️ Nenhuma categoria cadastrada para ${lancamento.empresa}.\n\nCadastre categorias antes de classificar.`
    });
    sessoesAtivas.delete(grupoId);
    return true;
  }

  // Montar mensagem com categorias
  const valorFormatado = Math.abs(parseFloat(lancamento.valor)).toFixed(2);
  let mensagem = `📝 *CLASSIFICANDO LANÇAMENTO*\n\n`;
  mensagem += `💰 R$ ${valorFormatado} - ${lancamento.tipo === 'CREDITO' ? 'Recebido' : 'Pago'}\n`;
  mensagem += `📅 ${new Date(lancamento.data).toLocaleDateString('pt-BR')}\n`;
  mensagem += `🏢 ${lancamento.empresa}\n`;
  mensagem += `📝 ${lancamento.descricao_original}\n\n`;
  mensagem += `━━━━━━━━━━━━━━━━\n`;
  mensagem += `📂 *CATEGORIAS DISPONÍVEIS:*\n\n`;

  categorias.rows.forEach((cat, index) => {
    const num = index + 1;
    mensagem += `${num}. ${cat.icone || '📌'} ${cat.nome}\n`;
  });

  mensagem += `\n✏️ *Responda o número da categoria*`;

  await sock.sendMessage(grupoId, { text: mensagem });

  // Atualizar sessão
  sessao.etapa = 'AGUARDANDO_CATEGORIA';
  sessao.lancamentoEscolhido = lancamento;
  sessao.categorias = categorias.rows;
  sessao.timestamp = Date.now();

  return true;
}

/**
 * Processa categoria escolhida
 */
async function processarCategoriaEscolhida(sock, grupoId, remetente, texto, sessao) {
  const numero = parseInt(texto.trim());

  if (isNaN(numero) || numero < 1 || numero > sessao.categorias.length) {
    await sock.sendMessage(grupoId, {
      text: `⚠️ Número inválido. Responda entre 1 e ${sessao.categorias.length}.`
    });
    return true;
  }

  const categoria = sessao.categorias[numero - 1];
  const lanc = sessao.lancamentoEscolhido;

  // Pedir observação
  let mensagem = `📝 *OBSERVAÇÃO (OPCIONAL)*\n\n`;
  mensagem += `Digite uma observação sobre este lançamento\n`;
  mensagem += `ou responda *pular* para continuar sem observação.\n\n`;
  mensagem += `━━━━━━━━━━━━━━━━\n`;
  mensagem += `Exemplos:\n`;
  mensagem += `• Referente ao mês de agosto\n`;
  mensagem += `• Pagamento parcial\n`;
  mensagem += `• Manutenção programada\n\n`;
  mensagem += `✏️ *Digite a observação ou "pular"*`;

  await sock.sendMessage(grupoId, { text: mensagem });

  // Atualizar sessão
  sessao.etapa = 'AGUARDANDO_OBSERVACAO';
  sessao.categoriaEscolhida = categoria;
  sessao.timestamp = Date.now();

  return true;
}

/**
 * Processa observação digitada
 */
async function processarObservacao(sock, grupoId, remetente, texto, sessao) {
  const observacao = texto.trim();

  // Verificar se pulou
  if (observacao.toLowerCase() === 'pular' || observacao === '-') {
    sessao.observacaoUsuario = null;
  } else {
    sessao.observacaoUsuario = observacao;
  }

  // Pedir recibo
  let mensagem = `📎 *RECIBO/COMPROVANTE (OPCIONAL)*\n\n`;
  mensagem += `Envie uma foto ou PDF do recibo\n`;
  mensagem += `ou responda *pular* para continuar sem anexo.\n\n`;
  mensagem += `━━━━━━━━━━━━━━━━\n`;
  mensagem += `Aceito: Foto, PDF, Imagem\n\n`;
  mensagem += `✏️ *Envie o arquivo ou "pular"*`;

  await sock.sendMessage(grupoId, { text: mensagem });

  // Atualizar sessão
  sessao.etapa = 'AGUARDANDO_RECIBO';
  sessao.timestamp = Date.now();

  return true;
}

/**
 * Processa recibo enviado
 */
async function processarRecibo(sock, grupoId, remetente, mensagem, sessao) {
  const lanc = sessao.lancamentoEscolhido;
  const categoria = sessao.categoriaEscolhida;

  // DEBUG: Log completo da estrutura
  console.log('📎 Processando recibo, tipo de mensagem:', mensagem.message ? Object.keys(mensagem.message) : 'SEM MENSAGEM');
  console.log('📎 Estrutura completa da mensagem:', JSON.stringify(mensagem, null, 2).substring(0, 500));

  // Verificar se é texto "pular"
  if (mensagem.message?.conversation || mensagem.message?.extendedTextMessage) {
    const texto = (mensagem.message.conversation || mensagem.message.extendedTextMessage?.text || '').trim().toLowerCase();

    if (texto === 'pular' || texto === '-') {
      // Não adiciona arquivo, vai direto para confirmação
      // Se já tem arquivos anexados, mantém. Se não tem, fica sem.
      return await mostrarConfirmacao(sock, grupoId, sessao);
    }

    // Se é texto mas NÃO é "pular", avisa que precisa enviar arquivo
    await sock.sendMessage(grupoId, {
      text: '⚠️ Envie uma *imagem* ou *PDF* do recibo, ou responda *pular* para continuar sem anexo.'
    });
    return true;
  }

  // Verificar se enviou arquivo/imagem
  const messageType = Object.keys(mensagem.message || {})[0];

  if (!['imageMessage', 'documentMessage', 'videoMessage'].includes(messageType)) {
    await sock.sendMessage(grupoId, {
      text: '⚠️ Envie uma imagem, PDF ou responda *pular*.'
    });
    return true;
  }

  try {
    // Baixar arquivo
    const buffer = await downloadMediaMessage(
      mensagem,
      'buffer',
      {},
      {
        logger: console,
        reuploadRequest: sock.updateMediaMessage
      }
    );

    // Gerar nome do arquivo
    const agora = new Date();
    const nomeArquivo = agora.toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15); // yyyymmdd_hhmmss

    // Extensão do arquivo
    const mimeType = mensagem.message[messageType]?.mimetype || 'image/jpeg';
    const ext = mimeType.includes('pdf') ? 'pdf' :
                mimeType.includes('png') ? 'png' :
                mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'bin';

    const nomeCompleto = `${nomeArquivo}.${ext}`;

    // Salvar arquivo na sessão (suporta múltiplos arquivos)
    if (!sessao.recibosArquivos) {
      sessao.recibosArquivos = [];
    }

    sessao.recibosArquivos.push({
      buffer,
      nome: nomeCompleto,
      mimetype: mimeType
    });

    // Ir para confirmação
    return await mostrarConfirmacao(sock, grupoId, sessao);

  } catch (err) {
    console.error('❌ Erro ao processar arquivo:', err);
    await sock.sendMessage(grupoId, {
      text: '❌ Erro ao processar arquivo. Tente novamente ou responda *pular*.'
    });
    return true;
  }
}

/**
 * Mostra confirmação final
 */
async function mostrarConfirmacao(sock, grupoId, sessao) {
  const lanc = sessao.lancamentoEscolhido;
  const categoria = sessao.categoriaEscolhida;
  const valorFormatado = Math.abs(parseFloat(lanc.valor)).toFixed(2);

  let mensagem = `✅ *CONFIRMAÇÃO FINAL*\n\n`;
  mensagem += `💰 *Lançamento:*\n`;
  mensagem += `   R$ ${valorFormatado} - ${lanc.descricao_original}\n\n`;
  mensagem += `📂 *Categoria:*\n`;
  mensagem += `   ${categoria.icone || '📌'} ${categoria.nome}\n\n`;

  if (sessao.observacaoUsuario) {
    mensagem += `📝 *Observação:*\n`;
    mensagem += `   ${sessao.observacaoUsuario}\n\n`;
  }

  if (sessao.recibosArquivos && sessao.recibosArquivos.length > 0) {
    if (sessao.recibosArquivos.length === 1) {
      mensagem += `📎 *Recibo:*\n`;
      mensagem += `   ✅ Anexado: ${sessao.recibosArquivos[0].nome}\n\n`;
    } else {
      mensagem += `📎 *Recibos:*\n`;
      sessao.recibosArquivos.forEach((arquivo, index) => {
        mensagem += `   ✅ Anexado (${index + 1}): ${arquivo.nome}\n`;
      });
      mensagem += `\n`;
    }
  }

  mensagem += `━━━━━━━━━━━━━━━━\n`;
  mensagem += `✏️ *Confirma? (s/n) ou (o) outro*`;

  await sock.sendMessage(grupoId, { text: mensagem });

  // Atualizar sessão
  sessao.etapa = 'AGUARDANDO_CONFIRMACAO';
  sessao.timestamp = Date.now();

  return true;
}

/**
 * Processa confirmação (s/n)
 */
async function processarConfirmacao(sock, grupoId, remetente, texto, sessao) {
  const resposta = texto.trim().toLowerCase();

  // Aceita: s, n, o
  if (!['s', 'sim', 'n', 'nao', 'não', 'o', 'outro'].includes(resposta)) {
    await sock.sendMessage(grupoId, {
      text: '⚠️ Responda *s* para confirmar, *n* para cancelar ou *o* para anexar outro arquivo.'
    });
    return true;
  }

  // Cancelar
  if (resposta === 'n' || resposta === 'nao' || resposta === 'não') {
    await sock.sendMessage(grupoId, {
      text: '❌ Classificação cancelada.\n\nUse *lll* para ver a lista novamente.'
    });
    sessoesAtivas.delete(grupoId);
    return true;
  }

  // Anexar outro arquivo
  if (resposta === 'o' || resposta === 'outro') {
    const totalAnexado = sessao.recibosArquivos?.length || 0;

    let mensagem = `📎 *ANEXAR OUTRO ARQUIVO*\n\n`;
    mensagem += `✅ Já anexado: ${totalAnexado} arquivo${totalAnexado !== 1 ? 's' : ''}\n\n`;
    mensagem += `Envie mais uma foto ou PDF\n`;
    mensagem += `ou responda *pular* para finalizar.\n\n`;
    mensagem += `━━━━━━━━━━━━━━━━\n`;
    mensagem += `✏️ *Envie o arquivo ou "pular"*`;

    await sock.sendMessage(grupoId, { text: mensagem });

    // Volta para aguardar recibo
    sessao.etapa = 'AGUARDANDO_RECIBO';
    sessao.timestamp = Date.now();

    return true;
  }

  // CONFIRMAR - Atualizar banco
  const lanc = sessao.lancamentoEscolhido;
  const categoria = sessao.categoriaEscolhida;
  const observacao = sessao.observacaoUsuario || null;
  const recibosArquivos = sessao.recibosArquivos || [];

  // SALVAR RECIBOS NO VERCEL BLOB (se houver)
  // ✅ Storage permanente - arquivos não são perdidos no redeploy
  const recibosUrls = [];

  if (recibosArquivos.length > 0) {
    try {
      // Estrutura FLAT: recibos/{EMPRESA}/{CATEGORIA_ID}_{LANCAMENTO_ID}_{TIMESTAMP}.{ext}
      // Exemplo: recibos/IMOBEM/001_123456_20260912_022021.jpg

      // Formatar ID da categoria como nnn (3 dígitos)
      const categoriaIdFormatado = String(categoria.id).padStart(3, '0');

      // Upload de cada arquivo para Vercel Blob
      for (const reciboArquivo of recibosArquivos) {
        // Nome do arquivo: {CATEGORIA_ID}_{LANCAMENTO_ID}_{TIMESTAMP}.{ext}
        const ext = path.extname(reciboArquivo.nome); // .jpg, .pdf, etc
        const timestamp = reciboArquivo.nome.replace(ext, ''); // Remove extensão
        const nomeArquivo = `${categoriaIdFormatado}_${lanc.id}_${timestamp}${ext}`;

        // Caminho no Vercel Blob: recibos/{EMPRESA}/{ARQUIVO}
        const blobPath = `recibos/${lanc.empresa}/${nomeArquivo}`;

        // Upload para Vercel Blob
        const blob = await put(blobPath, reciboArquivo.buffer, {
          addRandomSuffix: false // Manter nome exato
        });

        // Salvar URL retornada
        recibosUrls.push({
          nome: nomeArquivo,
          url: blob.url,
          tamanho: reciboArquivo.buffer.length,
          tipo: ext.replace('.', ''),
          uploadedAt: new Date().toISOString()
        });

        console.log(`📎 Recibo salvo no Vercel Blob: ${blob.url}`);
      }

      console.log(`✅ Total de recibos salvos: ${recibosUrls.length}`);
      console.log(`📋 Formato: {CATEGORIA_ID}_{LANCAMENTO_ID}_{TIMESTAMP}.{ext}`);
      console.log(`☁️  Storage permanente: Vercel Blob`);

    } catch (err) {
      console.error('❌ Erro ao salvar recibos no Vercel Blob:', err);
      // Continua mesmo com erro no arquivo
    }
  }

  // Atualizar lançamento (com observação e URLs dos recibos)
  // Cast explícito para TEXT quando observacao é null (evita erro de tipo)
  await pool.query(`
    UPDATE bank_extratos
    SET
      classificacao = $2,
      classificacao_manual = true,
      classificado_por = $3,
      classificado_em = NOW(),
      status_classificacao = 'OK',
      confianca = 1.0,
      observacoes = CASE
        WHEN $4::TEXT IS NOT NULL AND $4::TEXT != '' THEN
          CASE
            WHEN observacoes IS NULL OR observacoes = '' THEN $4::TEXT
            ELSE observacoes || E'\\n---\\n' || $4::TEXT
          END
        ELSE observacoes
      END,
      recibos_urls = CASE
        WHEN $5::JSONB IS NOT NULL THEN
          CASE
            WHEN recibos_urls IS NULL OR recibos_urls::TEXT = '[]' THEN $5::JSONB
            ELSE recibos_urls || $5::JSONB
          END
        ELSE recibos_urls
      END
    WHERE id = $1
  `, [
    lanc.id,
    categoria.nome,
    `WhatsApp: ${remetente}`,
    observacao || null,
    recibosUrls.length > 0 ? JSON.stringify(recibosUrls) : null
  ]);

  // INCREMENTAR CONTADOR DE USO (Ordem Inteligente)
  await pool.query(`
    UPDATE bank_categorias
    SET vezes_usada = vezes_usada + 1
    WHERE id = $1
  `, [categoria.id]);

  // Registrar no histórico (com observação e URLs dos recibos)
  const observacaoHistorico = [
    'Classificação manual via WhatsApp (comando lll)',
    observacao ? `Observação: ${observacao}` : null,
    recibosUrls.length > 0 ? `Recibos (${recibosUrls.length}): ${recibosUrls.map(r => r.url).join(', ')}` : null
  ].filter(Boolean).join(' | ');

  await pool.query(`
    INSERT INTO bank_historico_classificacoes
      (extrato_id, classificacao_nova, classificado_por, observacao)
    VALUES ($1, $2, $3, $4)
  `, [lanc.id, categoria.nome, `WhatsApp: ${remetente}`, observacaoHistorico]);

  // Mensagem de sucesso
  let mensagemSucesso = `✅ *LANÇAMENTO CLASSIFICADO COM SUCESSO!*\n\n`;
  mensagemSucesso += `📂 ${categoria.icone || '📌'} ${categoria.nome}`;

  if (observacao) {
    mensagemSucesso += `\n📝 ${observacao}`;
  }

  if (recibosUrls.length > 0) {
    if (recibosUrls.length === 1) {
      mensagemSucesso += `\n📎 1 recibo salvo`;
    } else {
      mensagemSucesso += `\n📎 ${recibosUrls.length} recibos salvos`;
    }
  }

  await sock.sendMessage(grupoId, { text: mensagemSucesso });

  // Limpar sessão
  sessoesAtivas.delete(grupoId);

  // Mostrar próximos pendentes automaticamente
  setTimeout(() => {
    listarPendentes(sock, grupoId);
  }, 1500);

  return true;
}

// ============================================================
// LIMPEZA DE SESSÕES EXPIRADAS (a cada 10 minutos)
// ============================================================
setInterval(() => {
  const agora = Date.now();
  const timeout = 10 * 60 * 1000; // 10 minutos

  for (const [grupoId, sessao] of sessoesAtivas.entries()) {
    if (agora - sessao.timestamp > timeout) {
      console.log(`🧹 Limpando sessão expirada: ${grupoId}`);
      sessoesAtivas.delete(grupoId);
    }
  }
}, 10 * 60 * 1000);

// ============================================================
// FIM
// ============================================================
