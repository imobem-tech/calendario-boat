// ============================================================
// wpp/routes/banco/comando-pendentes.js — V.260912000000
// COMANDO WHATSAPP: ppp (LANÇAMENTOS PENDENTES)
// Fluxo interativo de classificação de lançamentos bancários
// FUNCIONA APENAS EM GRUPOS FINANCEIROS AUTORIZADOS
// FILTRA PENDENTES POR EMPRESA DO GRUPO
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;
import { isGrupoFinanceiro, identificarEmpresaPorGrupo } from '../../config/grupos-financeiros.js';

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
      const emoji = numero === 1 ? '1️⃣' : numero === 2 ? '2️⃣' : '3️⃣';
      const dataFormatada = new Date(lanc.data).toLocaleDateString('pt-BR');
      const valorFormatado = Math.abs(parseFloat(lanc.valor)).toFixed(2);
      const tipoEmoji = lanc.tipo === 'CREDITO' ? '💰' : '💸';

      mensagem += `${emoji} R$ ${valorFormatado} - ${lanc.tipo === 'CREDITO' ? 'Recebido' : 'Pago'} - ${dataFormatada}\n`;
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
 */
export async function processarRespostaPendente(sock, grupoId, remetente, texto) {
  const sessao = sessoesAtivas.get(grupoId);
  if (!sessao) return false;

  try {
    switch (sessao.etapa) {
      case 'AGUARDANDO_NUMERO':
        return await processarNumeroEscolhido(sock, grupoId, remetente, texto, sessao);

      case 'AGUARDANDO_CATEGORIA':
        return await processarCategoriaEscolhida(sock, grupoId, remetente, texto, sessao);

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

  // Buscar categorias da empresa
  const categorias = await pool.query(`
    SELECT id, nome, tipo, icone
    FROM bank_categorias
    WHERE empresa = $1 AND ativo = true
    ORDER BY ordem, nome
  `, [lancamento.empresa]);

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
    mensagem += `${num}. ${cat.icone || '📌'} ${cat.nome} (${cat.tipo})\n`;
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

  // Pedir confirmação
  const valorFormatado = Math.abs(parseFloat(lanc.valor)).toFixed(2);
  let mensagem = `✅ *CONFIRMAÇÃO*\n\n`;
  mensagem += `💰 *Lançamento:*\n`;
  mensagem += `   R$ ${valorFormatado} - ${lanc.descricao_original}\n\n`;
  mensagem += `📂 *Classificação:*\n`;
  mensagem += `   ${categoria.icone || '📌'} ${categoria.nome}\n\n`;
  mensagem += `━━━━━━━━━━━━━━━━\n`;
  mensagem += `✏️ *Confirma? (s/n)*`;

  await sock.sendMessage(grupoId, { text: mensagem });

  // Atualizar sessão
  sessao.etapa = 'AGUARDANDO_CONFIRMACAO';
  sessao.categoriaEscolhida = categoria;
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

  await pool.query(`
    UPDATE bank_extratos
    SET
      classificacao = $2,
      classificacao_manual = true,
      classificado_por = $3,
      classificado_em = NOW(),
      status_classificacao = 'OK',
      confianca = 1.0
    WHERE id = $1
  `, [lanc.id, categoria.nome, `WhatsApp: ${remetente}`]);

  // Registrar no histórico
  await pool.query(`
    INSERT INTO bank_historico_classificacoes
      (extrato_id, classificacao_nova, classificado_por, observacao)
    VALUES ($1, $2, $3, $4)
  `, [lanc.id, categoria.nome, `WhatsApp: ${remetente}`, 'Classificação manual via WhatsApp (comando ppp)']);

  await sock.sendMessage(grupoId, {
    text: `✅ *LANÇAMENTO CLASSIFICADO COM SUCESSO!*\n\n📂 ${categoria.icone || '📌'} ${categoria.nome}`
  });

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
