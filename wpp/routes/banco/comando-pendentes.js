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
import { downloadMediaMessage } from '@whiskeysockets/baileys';
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
 * Iniciar classificação Asaas (chamado automaticamente ao receber PIX)
 */
export async function iniciarClassificacaoAsaas(grupoId, lancamento, categorias, empresa) {
  estadoPendentes.set(grupoId, {
    etapa: 'escolher_categoria',
    lancamentoEscolhido: lancamento,
    categorias: categorias,
    empresa: empresa
  });
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

    // Determinar tipo (CREDITO se positivo, DEBITO se negativo)
    const tipoLancamento = lancamento.valor > 0 ? 'CREDITO' : 'DEBITO';

    // Buscar categorias disponíveis do tipo correto
    const categorias = await buscarCategorias(estado.empresa, tipoLancamento);

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

      // Enviar descrição SOZINHA para facilitar copiar
      await sock.sendMessage(grupoId, {
        text: estado.lancamentoEscolhido.descricao_original
      });

      // Depois enviar instruções
      await sock.sendMessage(grupoId, {
        text: `🧠 *CRIAR REGRA AUTOMÁTICA*\n\n${'━'.repeat(16)}\n✂️ *COPIE* a descrição acima e *COLE*\n   somente o trecho que deve ser comparado\n\nExemplos:\n• "Hora_MOTOR 586-E2" (embarcação específica)\n• "Hora_MOTOR" (qualquer embarcação)\n• "586-E2" (só código)\n• Toda descrição (exatamente igual)\n\n✏️ Cole o trecho:`
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

    const valorReal = Math.abs(estado.lancamentoEscolhido.valor);
    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valorReal);

    const valorCentavos = Math.round(valorReal * 100);
    const valorMin = Math.round(valorCentavos * 0.9) / 100;
    const valorMax = Math.round(valorCentavos * 1.1) / 100;

    await sock.sendMessage(grupoId, {
      text: `💰 *TOLERÂNCIA DE VALOR*\n\nValor deste lançamento: ${valorFormatado}\n\n${'━'.repeat(16)}\nDigite o % de tolerância aceito:\n\n• 0 = Somente ${valorFormatado} (valor exato)\n• 10 = De R$ ${valorMin.toFixed(2)} até R$ ${valorMax.toFixed(2)} (±10%)\n• 50 = De R$ ${(valorCentavos * 0.5 / 100).toFixed(2)} até R$ ${(valorCentavos * 1.5 / 100).toFixed(2)} (±50%)\n\n✏️ Digite o %:`
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
      const valorCentavos = Math.round(Math.abs(estado.lancamentoEscolhido.valor) * 100);

      await salvarRegraAprendida({
        categoriaId: estado.categoriaEscolhida.id,
        fraseChave: estado.fraseChave,
        valorCentavos: valorCentavos,
        toleranciaPercent: tolerancia,
        observacao: estado.observacao || ''
      });

      // Marcar lançamento como OK
      await pool.query(`
        UPDATE bank_extratos
        SET
          classificacao = $1,
          observacoes = $2,
          status = 'OK',
          classificacao_manual = false,
          classificado_por = 'Usuário - Aprendizado',
          classificado_em = NOW()
        WHERE id = $3
      `, [estado.categoriaEscolhida.id, estado.observacao || '', estado.lancamentoEscolhido.id]);

      // Confirmar sucesso com valores em reais
      const variacaoMax = Math.round(valorCentavos * tolerancia / 100);
      const valorMin = (valorCentavos - variacaoMax) / 100;
      const valorMax = (valorCentavos + variacaoMax) / 100;

      const valorFormatado = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(valorCentavos / 100);

      await sock.sendMessage(grupoId, {
        text: `✅ *REGRA CRIADA COM SUCESSO!*\n\n📌 Categoria: ${estado.categoriaEscolhida.nome}\n🔍 Trecho: "${estado.fraseChave}"\n💰 Valor: ${valorFormatado} ± ${tolerancia}%\n💬 Observação: "${estado.observacao || '(vazio)'}"\n✨ Status: OK (não precisa recibo)\n\n${'━'.repeat(16)}\n📚 *PRÓXIMAS VEZES:*\n\nLançamentos que tenham:\n✅ "${estado.fraseChave}" na descrição\n✅ Valor entre R$ ${valorMin.toFixed(2)} e R$ ${valorMax.toFixed(2)}\n\nVão automaticamente para:\n✅ Categoria: ${estado.categoriaEscolhida.nome}\n✅ Observação: "${estado.observacao || '(vazio)'}"\n✅ Status: OK\n\nNada mais a fazer! 🎉`
      });

      estadoPendentes.delete(grupoId);

    } catch (err) {
      console.error('❌ Erro ao salvar regra:', err);
      console.error('Stack:', err.stack);
      await sock.sendMessage(grupoId, {
        text: `❌ Erro ao criar regra:\n${err.message}\n\nTente novamente.`
      });
    }

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 7: Aguardar múltiplos arquivos
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'aguardar_mais_arquivos') {

    if (textoLimpo.toLowerCase() === 'gravar') {
      // Mostrar tela de confirmação final
      await mostrarConfirmacaoFinal(sock, grupoId, estado);
      estado.etapa = 'confirmar_finalizacao';
      return true;
    }

    // Aguarda próximo arquivo (tratado em outro handler)
    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ETAPA 8: Confirmar finalização (s/n/o)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  else if (estado.etapa === 'confirmar_finalizacao') {
    const opcao = textoLimpo.toLowerCase();

    if (opcao === 's') {
      // Salvar e finalizar
      await finalizarClassificacao(sock, grupoId, estado, 'OK');
      estadoPendentes.delete(grupoId);
      return true;
    }
    else if (opcao === 'n') {
      // Cancelar
      await sock.sendMessage(grupoId, {
        text: '❌ Classificação cancelada.'
      });
      estadoPendentes.delete(grupoId);
      return true;
    }
    else if (opcao === 'o') {
      // Anexar outro arquivo
      estado.etapa = 'aguardar_mais_arquivos';
      await sock.sendMessage(grupoId, {
        text: `📎 *ANEXAR OUTRO ARQUIVO*\n\n✅ Já anexado: ${estado.arquivos.length} arquivo(s)\n\nEnvie mais uma foto ou PDF\nou responda "gravar" para confirmar.\n\n${'━'.repeat(16)}\n✏️ Envie o arquivo ou "gravar"`
      });
      return true;
    }

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
 * Mostrar tela de confirmação final
 */
async function mostrarConfirmacaoFinal(sock, grupoId, estado) {
  const valorFormatado = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Math.abs(estado.lancamentoEscolhido.valor));

  let mensagem = `✅ *CONFIRMAÇÃO FINAL*\n\n`;
  mensagem += `💰 Lançamento:\n`;
  mensagem += `   ${valorFormatado} - ${estado.lancamentoEscolhido.descricao_original}\n\n`;
  mensagem += `📂 Categoria:\n`;
  mensagem += `   ${estado.categoriaEscolhida.icone || '📁'} ${estado.categoriaEscolhida.nome}\n\n`;
  mensagem += `📝 Observação:\n`;
  mensagem += `   ${estado.observacao || '(vazio)'}\n\n`;

  if (estado.arquivos && estado.arquivos.length > 0) {
    mensagem += `📎 Recibo${estado.arquivos.length > 1 ? 's' : ''}:\n`;
    estado.arquivos.forEach((arq, i) => {
      mensagem += `   ✅ Anexado (${i + 1}): ${arq.nome}\n`;
    });
  } else {
    mensagem += `📎 Recibo:\n   ⚠️ Sem anexo\n`;
  }

  mensagem += `\n${'━'.repeat(16)}\n`;
  mensagem += `✏️ Confirma? (s/n) ou (o) outro`;

  await sock.sendMessage(grupoId, { text: mensagem });
}

/**
 * Buscar categorias da empresa filtradas por tipo
 * @param {string} empresa - Nome da empresa
 * @param {string} tipo - 'CREDITO' ou 'DEBITO'
 */
async function buscarCategorias(empresa, tipo) {
  const result = await pool.query(`
    SELECT id, nome, tipo, icone
    FROM bank_categorias
    WHERE empresa IN ('TODAS', $1)
      AND ativo = true
      AND tipo = $2
    ORDER BY nome
  `, [empresa, tipo]);

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
        observacoes = $2,
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
