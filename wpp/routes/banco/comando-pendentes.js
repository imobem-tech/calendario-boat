// ============================================================
// wpp/routes/banco/comando-pendentes.js — V.260912160000
// COMANDO "lll" - LISTAR E PROCESSAR LANÇAMENTOS PENDENTES
// FUNCIONALIDADES:
// - Listar pendentes (comando "lll")
// - Escolher número para classificar
// - Escolher categoria
// - Adicionar observação
// - Enviar recibo OU "pular" OU "aprender"
// - Múltiplos arquivos com "gravar"
// ============================================================

import { put } from '@vercel/blob';
import pkg from 'pg';
const { Pool } = pkg;
import { salvarRegraAprendida } from './classificacao-automatica.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Estado de processamento por grupo
// grupoId → { etapa, lancamentoId, categoriaId, observacao, arquivos[], ... }
const estadoPendentes = new Map();

/**
 * Verifica se é comando "lll"
 */
export function ehComandoListarPendentes(texto) {
  return /^lll$/i.test(texto?.trim());
}

/**
 * Verifica se grupo está processando pendentes
 */
export function estaProcessandoPendentes(grupoId) {
  return estadoPendentes.has(grupoId);
}

/**
 * COMANDO: lll (listar pendentes)
 */
export async function listarPendentes(sock, grupoId, empresa) {
  try {
    // Buscar lançamentos PENDENTES
    const result = await pool.query(`
      SELECT
        id,
        data,
        valor,
        descricao_original,
        tipo,
        cpf_cnpj_origem,
        classificacao,
        campos_extras
      FROM bank_extratos
      WHERE empresa = $1
        AND status = 'PENDENTE'
      ORDER BY data DESC, id DESC
      LIMIT 10
    `, [empresa]);

    if (result.rows.length === 0) {
      await sock.sendMessage(grupoId, {
        text: '✅ *NENHUM LANÇAMENTO PENDENTE!*\n\nTodos os lançamentos estão classificados.'
      });
      return;
    }

    // Montar mensagem
    let mensagem = `📋 *LANÇAMENTOS PENDENTES (${result.rows.length}/10)*\n\n`;

    for (let i = 0; i < Math.min(3, result.rows.length); i++) {
      const lanc = result.rows[i];
      const numero = i + 1;
      const dataFormatada = new Date(lanc.data).toLocaleDateString('pt-BR');
      const valorFormatado = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(Math.abs(lanc.valor));

      const tipoEmoji = lanc.valor > 0 ? 'Recebido' : 'Pago';

      // Extrair info extra
      let infoExtra = '';
      try {
        const extras = JSON.parse(lanc.campos_extras || '{}');
        if (extras.forma_pagamento) {
          infoExtra = `\n   💬 ${extras.forma_pagamento}`;
        }
      } catch {}

      mensagem += `${numero} ${'━'.repeat(16)}\n`;
      mensagem += `${valorFormatado} - ${tipoEmoji} - ${dataFormatada}\n`;
      mensagem += `   🏢 ${empresa} | Asaas\n`;
      mensagem += `   📝 ${lanc.descricao_original}\n`;
      if (lanc.cpf_cnpj_origem) {
        mensagem += `   👤 CPF/CNPJ: ${lanc.cpf_cnpj_origem}\n`;
      }
      mensagem += infoExtra;
      mensagem += `\n`;
    }

    mensagem += `${'━'.repeat(16)}\n`;
    mensagem += `✏️ Responda o número (1, 2 ou 3) para classificar`;

    await sock.sendMessage(grupoId, { text: mensagem });

    // Salvar lançamentos para escolha
    estadoPendentes.set(grupoId, {
      etapa: 'escolher_numero',
      lancamentos: result.rows.slice(0, 3),
      empresa
    });

  } catch (err) {
    console.error('❌ Erro ao listar pendentes:', err);
    await sock.sendMessage(grupoId, {
      text: '❌ Erro ao buscar lançamentos pendentes.'
    });
  }
}

/**
 * Processar resposta do usuário
 */
export async function processarRespostaPendentes(sock, grupoId, mensagem, remetente) {
  const estado = estadoPendentes.get(grupoId);
  if (!estado) return false;

  const texto = mensagem.message?.conversation ||
                mensagem.message?.extendedTextMessage?.text || '';

  const textoLimpo = texto.trim();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 1: Escolher número do lançamento
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (estado.etapa === 'escolher_numero') {
    const numero = parseInt(textoLimpo, 10);

    if (isNaN(numero) || numero < 1 || numero > estado.lancamentos.length) {
      return true; // Ignora resposta inválida
    }

    const lancamento = estado.lancamentos[numero - 1];

    // Buscar categorias disponíveis
    const categorias = await buscarCategorias(estado.empresa);

    // Atualizar estado
    estado.etapa = 'escolher_categoria';
    estado.lancamentoEscolhido = lancamento;
    estado.categorias = categorias;

    // Montar mensagem de categorias
    await enviarListaCategorias(sock, grupoId, lancamento, categorias);

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 2: Escolher categoria
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'escolher_categoria') {
    const numero = parseInt(textoLimpo, 10);

    if (isNaN(numero) || numero < 1 || numero > estado.categorias.length) {
      return true;
    }

    const categoria = estado.categorias[numero - 1];

    // Atualizar estado
    estado.etapa = 'digitar_observacao';
    estado.categoriaEscolhida = categoria;

    // Pedir observação
    await sock.sendMessage(grupoId, {
      text: `📝 *OBSERVAÇÃO (OPCIONAL)*\n\nDigite uma observação sobre este lançamento\nou responda *pular* para continuar sem observação.\n\n${'━'.repeat(16)}\nExemplos:\n* Referente ao mês de agosto\n* Pagamento parcial\n* Manutenção programada\n\n✏️ Digite a observação ou "pular"`
    });

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 3: Digitar observação
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'digitar_observacao') {
    const observacao = textoLimpo.toLowerCase() === 'pular' ? '' : textoLimpo;

    // Atualizar estado
    estado.etapa = 'aguardar_recibo';
    estado.observacao = observacao;
    estado.arquivos = [];

    // Pedir recibo
    await sock.sendMessage(grupoId, {
      text: `📎 *RECIBO/COMPROVANTE (OPCIONAL)*\n\nEnvie uma foto ou PDF do recibo,\nou escolha uma das opções:\n\n${'━'.repeat(16)}\nAceito: Foto, PDF, Imagem\n\n✏️ *Opções:*\n📎 Envie o arquivo\n⏭️ Digite "pular" (continua PENDENTE)\n🧠 Digite "aprender" (marca OK + cria regra automática)`
    });

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 4: Aguardar recibo/pular/aprender
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'aguardar_recibo') {

    // Opção 1: PULAR (sem recibo)
    if (textoLimpo.toLowerCase() === 'pular') {
      await finalizarClassificacao(sock, grupoId, estado, 'PENDENTE');
      estadoPendentes.delete(grupoId);
      return true;
    }

    // Opção 2: APRENDER (criar regra automática)
    else if (textoLimpo.toLowerCase() === 'aprender') {
      estado.etapa = 'aprender_copiar_descricao';

      await sock.sendMessage(grupoId, {
        text: `🧠 *CRIAR REGRA AUTOMÁTICA*\n\n📝 *DESCRIÇÃO DO LANÇAMENTO:*\n${estado.lancamentoEscolhido.descricao_original}\n\n${'━'.repeat(16)}\n✂️ *COPIE* a descrição acima e *COLE*\n   somente o trecho que deve ser comparado\n\nExemplos:\n• "Hora_MOTOR 586-E2" (embarcação específica)\n• "Hora_MOTOR" (qualquer embarcação)\n• "586-E2" (só código)\n• Toda descrição (exatamente igual)\n\n✏️ Cole o trecho:`
      });

      return true;
    }

    // Opção 3: ARQUIVO (processarImagemPendente)
    // Tratado em outro handler

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 5: Aprender - Copiar descrição
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'aprender_copiar_descricao') {
    estado.fraseChave = textoLimpo;
    estado.etapa = 'aprender_tolerancia';

    const valorInteiro = Math.floor(Math.abs(estado.lancamentoEscolhido.valor));

    await sock.sendMessage(grupoId, {
      text: `💰 *TOLERÂNCIA DE VALOR*\n\nValor deste lançamento: R$ ${valorInteiro},00\n\n${'━'.repeat(16)}\nDigite o % de tolerância aceito:\n\n• 0 = Somente R$ ${valorInteiro} (valor exato)\n• 10 = De R$ ${Math.floor(valorInteiro * 0.9)} até R$ ${Math.floor(valorInteiro * 1.1)} (±10%)\n• 50 = De R$ ${Math.floor(valorInteiro * 0.5)} até R$ ${Math.floor(valorInteiro * 1.5)} (±50%)\n\n✏️ Digite o %:`
    });

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 6: Aprender - Tolerância
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'aprender_tolerancia') {
    const tolerancia = parseInt(textoLimpo, 10);

    if (isNaN(tolerancia) || tolerancia < 0) {
      await sock.sendMessage(grupoId, {
        text: '❌ Digite um número válido (0, 10, 50, etc.)'
      });
      return true;
    }

    // Salvar regra aprendida
    try {
      const valorInteiro = Math.floor(Math.abs(estado.lancamentoEscolhido.valor));

      await salvarRegraAprendida({
        categoriaId: estado.categoriaEscolhida.id,
        fraseChave: estado.fraseChave,
        valorInteiro: valorInteiro,
        toleranciaPercent: tolerancia,
        observacao: estado.observacao || ''
      });

      // Marcar lançamento como OK
      await pool.query(`
        UPDATE bank_extratos
        SET
          classificacao = $1,
          observacao = $2,
          status = 'OK',
          classificacao_manual = false,
          classificado_por = 'Usuário - Aprendizado',
          classificado_em = NOW()
        WHERE id = $3
      `, [estado.categoriaEscolhida.id, estado.observacao || '', estado.lancamentoEscolhido.id]);

      // Confirmar sucesso
      const variacaoMax = Math.floor(valorInteiro * tolerancia / 100);
      const valorMin = valorInteiro - variacaoMax;
      const valorMax = valorInteiro + variacaoMax;

      await sock.sendMessage(grupoId, {
        text: `✅ *REGRA CRIADA COM SUCESSO!*\n\n📌 Categoria: ${estado.categoriaEscolhida.nome}\n🔍 Trecho: "${estado.fraseChave}"\n💰 Valor: R$ ${valorInteiro} ± ${tolerancia}%\n💬 Observação: "${estado.observacao || '(vazio)'}"\n✨ Status: OK (não precisa recibo)\n\n${'━'.repeat(16)}\n📚 *PRÓXIMAS VEZES:*\n\nLançamentos que tenham:\n✅ "${estado.fraseChave}" na descrição\n✅ Valor entre R$ ${valorMin} e R$ ${valorMax}\n\nVão automaticamente para:\n✅ Categoria ${estado.categoriaEscolhida.id}\n✅ Observação "${estado.observacao || '(vazio)'}"\n✅ Status OK\n\nNada mais a fazer! 🎉`
      });

      estadoPendentes.delete(grupoId);

    } catch (err) {
      console.error('❌ Erro ao salvar regra:', err);
      await sock.sendMessage(grupoId, {
        text: '❌ Erro ao criar regra. Tente novamente.'
      });
    }

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 7: Aguardar múltiplos arquivos
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'aguardar_mais_arquivos') {

    if (textoLimpo.toLowerCase() === 'gravar') {
      await finalizarClassificacao(sock, grupoId, estado, 'OK');
      estadoPendentes.delete(grupoId);
      return true;
    }

    // Aguarda próximo arquivo (tratado em outro handler)
    return true;
  }

  return false;
}

/**
 * Processar imagem/PDF de recibo
 */
export async function processarImagemPendente(sock, grupoId, mensagem) {
  const estado = estadoPendentes.get(grupoId);
  if (!estado || (estado.etapa !== 'aguardar_recibo' && estado.etapa !== 'aguardar_mais_arquivos')) {
    return false;
  }

  try {
    // Download do arquivo
    const buffer = await downloadMediaMessage(
      mensagem,
      'buffer',
      {},
      { logger: console, reuploadRequest: sock.updateMediaMessage }
    );

    // Upload para Vercel Blob
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const ext = mensagem.message.imageMessage ? '.jpg' : '.pdf';
    const nomeArquivo = `${estado.categoriaEscolhida.id}_${estado.lancamentoEscolhido.id}_${timestamp}${ext}`;
    const blobPath = `recibos/${estado.empresa}/${nomeArquivo}`;

    const blob = await put(blobPath, buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false
    });

    // Adicionar à lista
    estado.arquivos.push({
      nome: nomeArquivo,
      url: blob.url,
      tamanho: buffer.length,
      tipo: ext.replace('.', ''),
      uploadedAt: new Date().toISOString()
    });

    // Atualizar etapa
    estado.etapa = 'aguardar_mais_arquivos';

    // Confirmar
    await sock.sendMessage(grupoId, {
      text: `✅ Arquivo ${estado.arquivos.length} recebido e salvo!\n\n${'━'.repeat(16)}\nOpções:\n📎 Envie outro arquivo\n✅ Digite "gravar" para finalizar`
    });

    return true;

  } catch (err) {
    console.error('❌ Erro ao processar imagem:', err);
    await sock.sendMessage(grupoId, {
      text: '❌ Erro ao salvar arquivo. Tente novamente.'
    });
    return true;
  }
}

/**
 * Buscar categorias da empresa
 */
async function buscarCategorias(empresa) {
  const result = await pool.query(`
    SELECT id, nome, tipo, icone
    FROM bank_categorias
    WHERE empresa IN ('TODAS', $1)
      AND ativo = true
    ORDER BY
      CASE WHEN tipo = 'CREDITO' THEN 1 ELSE 2 END,
      nome
  `, [empresa]);

  return result.rows;
}

/**
 * Enviar lista de categorias
 */
async function enviarListaCategorias(sock, grupoId, lancamento, categorias) {
  const valorFormatado = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Math.abs(lancamento.valor));

  const dataFormatada = new Date(lancamento.data).toLocaleDateString('pt-BR');

  let mensagem = `📝 *CLASSIFICANDO LANÇAMENTO*\n\n`;
  mensagem += `💰 ${valorFormatado} - ${lancamento.valor > 0 ? 'Recebido' : 'Pago'}\n`;
  mensagem += `📅 ${dataFormatada}\n`;
  mensagem += `🏢 ${lancamento.empresa || 'N/A'}\n`;
  mensagem += `📝 ${lancamento.descricao_original}\n\n`;
  mensagem += `${'━'.repeat(16)}\n`;
  mensagem += `📂 *CATEGORIAS DISPONÍVEIS:*\n\n`;

  for (let i = 0; i < categorias.length; i++) {
    const cat = categorias[i];
    const icone = cat.icone || '📌';
    mensagem += `${i + 1}. ${icone} ${cat.nome}\n`;
  }

  mensagem += `\n✏️ Responda o número da categoria`;

  await sock.sendMessage(grupoId, { text: mensagem });
}

/**
 * Finalizar classificação
 */
async function finalizarClassificacao(sock, grupoId, estado, statusFinal) {
  try {
    // Montar URLs dos recibos
    const recibosUrls = estado.arquivos || [];

    // Atualizar banco
    await pool.query(`
      UPDATE bank_extratos
      SET
        classificacao = $1,
        observacao = $2,
        recibos_urls = $3::jsonb,
        status = $4,
        classificacao_manual = true,
        classificado_por = 'Usuário - WhatsApp',
        classificado_em = NOW()
      WHERE id = $5
    `, [
      estado.categoriaEscolhida.id,
      estado.observacao || '',
      JSON.stringify(recibosUrls),
      statusFinal,
      estado.lancamentoEscolhido.id
    ]);

    // Confirmar
    const emoji = statusFinal === 'OK' ? '✅' : '⏭️';
    const msg = statusFinal === 'OK'
      ? `${emoji} *Lançamento classificado e FINALIZADO!*\n\n📌 Categoria: ${estado.categoriaEscolhida.nome}\n💬 Observação: ${estado.observacao || '(vazio)'}\n📎 Recibos: ${recibosUrls.length} arquivo(s)`
      : `${emoji} *Lançamento classificado (PENDENTE)*\n\n📌 Categoria: ${estado.categoriaEscolhida.nome}\n💬 Observação: ${estado.observacao || '(vazio)'}\n\n⚠️ Aguardando recibo para finalizar`;

    await sock.sendMessage(grupoId, { text: msg });

  } catch (err) {
    console.error('❌ Erro ao finalizar:', err);
    await sock.sendMessage(grupoId, {
      text: '❌ Erro ao salvar classificação.'
    });
  }
}

// ============================================================
// FIM
// ============================================================
