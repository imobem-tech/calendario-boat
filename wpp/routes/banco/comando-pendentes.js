// ============================================================
// wpp/routes/banco/comando-pendentes.js — V.260912020000
// COMANDO WHATSAPP: ppp (LANÇAMENTOS PENDENTES)
// Fluxo interativo de classificação de lançamentos bancários
// FUNCIONA APENAS EM GRUPOS FINANCEIROS AUTORIZADOS
// FILTRA PENDENTES POR EMPRESA DO GRUPO
// ORDEM INTELIGENTE: Base + Boost por uso (Híbrido)
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;
import { isGrupoFinanceiro, identificarEmpresaPorGrupo } from '../../config/grupos-financeiros.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Controle de sessões interativas
const sessoesAtivas = new Map(); // grupoId → { etapa, dados }

/**
 * Verifica se é comando ppp
 */
export function ehComandoPendentes(texto) {
  return /^ppp$/i.test(texto.trim());
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
      text: '❌ Erro ao processar resposta. Tente novamente com *ppp*.'
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
      text: '⚠️ Lançamento não encontrado. Use *ppp* para ver a lista novamente.'
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

  // Verificar se é texto "pular"
  if (mensagem.message?.conversation || mensagem.message?.extendedTextMessage) {
    const texto = (mensagem.message.conversation || mensagem.message.extendedTextMessage?.text || '').trim().toLowerCase();

    if (texto === 'pular' || texto === '-') {
      sessao.reciboArquivo = null;
      // Ir para confirmação
      return await mostrarConfirmacao(sock, grupoId, sessao);
    }
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

    // Salvar sessão com dados do arquivo
    sessao.reciboArquivo = {
      buffer,
      nome: nomeCompleto,
      mimetype: mimeType
    };

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

  if (sessao.reciboArquivo) {
    mensagem += `📎 *Recibo:*\n`;
    mensagem += `   ✅ Anexado (${sessao.reciboArquivo.nome})\n\n`;
  }

  mensagem += `━━━━━━━━━━━━━━━━\n`;
  mensagem += `✏️ *Confirma? (s/n)*`;

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

  if (resposta !== 's' && resposta !== 'n' && resposta !== 'sim' && resposta !== 'nao' && resposta !== 'não') {
    await sock.sendMessage(grupoId, {
      text: '⚠️ Responda *s* para confirmar ou *n* para cancelar.'
    });
    return true;
  }

  if (resposta === 'n' || resposta === 'nao' || resposta === 'não') {
    await sock.sendMessage(grupoId, {
      text: '❌ Classificação cancelada.\n\nUse *ppp* para ver a lista novamente.'
    });
    sessoesAtivas.delete(grupoId);
    return true;
  }

  // CONFIRMAR - Atualizar banco
  const lanc = sessao.lancamentoEscolhido;
  const categoria = sessao.categoriaEscolhida;
  const observacao = sessao.observacaoUsuario || null;
  const reciboArquivo = sessao.reciboArquivo;

  // SALVAR RECIBO NA PASTA (se houver)
  let caminhoRecibo = null;
  if (reciboArquivo) {
    try {
      // Criar pasta se não existir
      const baseDir = 'D:\\OneDrive\\GESTAO_DZ\\-¢-\\OUTROS\\RECIBOS';
      const empresaDir = path.join(baseDir, lanc.empresa);
      const categoriaNome = categoria.nome.replace(/[/\\?%*:|"<>]/g, '_'); // Sanitizar nome
      const categoriaDir = path.join(empresaDir, categoriaNome);

      if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
      if (!fs.existsSync(empresaDir)) fs.mkdirSync(empresaDir, { recursive: true });
      if (!fs.existsSync(categoriaDir)) fs.mkdirSync(categoriaDir, { recursive: true });

      // Salvar arquivo
      caminhoRecibo = path.join(categoriaDir, reciboArquivo.nome);
      fs.writeFileSync(caminhoRecibo, reciboArquivo.buffer);

      console.log(`📎 Recibo salvo: ${caminhoRecibo}`);
    } catch (err) {
      console.error('❌ Erro ao salvar recibo:', err);
      // Continua mesmo com erro no arquivo
    }
  }

  // Atualizar lançamento (com observação)
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
        WHEN $4 IS NOT NULL THEN
          CASE
            WHEN observacoes IS NULL OR observacoes = '' THEN $4
            ELSE observacoes || E'\\n---\\n' || $4
          END
        ELSE observacoes
      END
    WHERE id = $1
  `, [lanc.id, categoria.nome, `WhatsApp: ${remetente}`, observacao]);

  // INCREMENTAR CONTADOR DE USO (Ordem Inteligente)
  await pool.query(`
    UPDATE bank_categorias
    SET vezes_usada = vezes_usada + 1
    WHERE id = $1
  `, [categoria.id]);

  // Registrar no histórico (com observação e caminho do recibo)
  const observacaoHistorico = [
    'Classificação manual via WhatsApp (comando ppp)',
    observacao ? `Observação: ${observacao}` : null,
    caminhoRecibo ? `Recibo: ${caminhoRecibo}` : null
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

  if (caminhoRecibo) {
    mensagemSucesso += `\n📎 Recibo salvo`;
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
