// ============================================================
// wpp/wpp-api.js — V.260923224500
// API HTTP para integração com Agente WhatsApp do Claude Code
// Endpoints para listar conversas, enviar mensagens, etc.
// ============================================================

import express from 'express';

const router = express.Router();

// Middleware para validar token (simples)
const validarToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  // Token simples local (pode melhorar depois)
  if (token === 'seu-token-local' || token === process.env.WPP_API_TOKEN) {
    next();
  } else {
    res.status(401).json({ erro: 'Token inválido' });
  }
};

// Aplicar validação em todas as rotas
router.use(validarToken);

/**
 * GET /api/wpp/status
 * Retorna status da conexão WhatsApp
 */
router.get('/status', (req, res) => {
  const { sock, conectado } = req.app.locals;

  let numero = null;
  let nome = null;

  try {
    numero = sock?.user?.id?.split(':')[0] || null;
    nome = sock?.user?.name || sock?.user?.verifiedName || '';
  } catch (err) {
    numero = null;
    nome = '';
  }

  res.json({
    conectado,
    numero,
    nome,
    versao: 'V.260923224500'
  });
});

/**
 * GET /api/wpp/nao-lidas
 * Lista mensagens não lidas
 */
router.get('/nao-lidas', async (req, res) => {
  const { sock, conectado } = req.app.locals;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  try {
    // Buscar chats
    const chats = await sock.store?.chats || [];

    const naoLidas = chats
      .filter(chat => chat.unreadCount > 0)
      .map(chat => ({
        jid: chat.id,
        nome: chat.name || chat.id.split('@')[0],
        naoLidas: chat.unreadCount,
        ultimaMensagem: chat.conversationTimestamp
      }))
      .sort((a, b) => b.ultimaMensagem - a.ultimaMensagem);

    res.json({
      total: naoLidas.length,
      conversas: naoLidas
    });
  } catch (error) {
    console.error('❌ Erro ao buscar não lidas:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/wpp/conversas
 * Lista todas as conversas
 */
router.get('/conversas', async (req, res) => {
  const { sock, conectado } = req.app.locals;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  try {
    const chats = await sock.store?.chats || [];

    const conversas = chats.map(chat => ({
      jid: chat.id,
      nome: chat.name || chat.id.split('@')[0],
      naoLidas: chat.unreadCount || 0,
      arquivada: chat.archived || false,
      silenciada: chat.mute || false,
      ultimaMensagem: chat.conversationTimestamp
    }))
    .sort((a, b) => b.ultimaMensagem - a.ultimaMensagem)
    .slice(0, 50); // Limitar a 50 conversas mais recentes

    res.json({
      total: conversas.length,
      conversas
    });
  } catch (error) {
    console.error('❌ Erro ao listar conversas:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/wpp/historico/:jid
 * Busca histórico de mensagens de uma conversa
 */
router.get('/historico/:jid', async (req, res) => {
  const { sock, conectado } = req.app.locals;
  const { jid } = req.params;
  const limite = parseInt(req.query.limite) || 20;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  try {
    // Buscar mensagens do histórico
    const mensagens = await sock.loadMessages(jid, limite);

    const historico = mensagens.map(msg => ({
      id: msg.key.id,
      de: msg.key.fromMe ? 'eu' : (msg.key.participant || jid),
      texto: msg.message?.conversation ||
             msg.message?.extendedTextMessage?.text ||
             '[mídia]',
      timestamp: msg.messageTimestamp,
      data: new Date(msg.messageTimestamp * 1000).toISOString()
    }));

    res.json({
      jid,
      total: historico.length,
      mensagens: historico
    });
  } catch (error) {
    console.error('❌ Erro ao buscar histórico:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/wpp/contatos
 * Lista contatos
 */
router.get('/contatos', async (req, res) => {
  const { sock, conectado } = req.app.locals;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  try {
    const contatos = await sock.store?.contacts || {};

    const lista = Object.entries(contatos)
      .filter(([jid]) => jid.endsWith('@s.whatsapp.net'))
      .map(([jid, contato]) => ({
        jid,
        nome: contato.name || contato.notify || jid.split('@')[0],
        numero: jid.split('@')[0]
      }))
      .slice(0, 100); // Limitar a 100

    res.json({
      total: lista.length,
      contatos: lista
    });
  } catch (error) {
    console.error('❌ Erro ao listar contatos:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/wpp/grupos
 * Lista grupos
 */
router.get('/grupos', async (req, res) => {
  const { sock, conectado } = req.app.locals;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  try {
    const chats = await sock.store?.chats || [];

    const grupos = chats
      .filter(chat => chat.id.endsWith('@g.us'))
      .map(chat => ({
        jid: chat.id,
        nome: chat.name || 'Sem nome',
        naoLidas: chat.unreadCount || 0
      }));

    res.json({
      total: grupos.length,
      grupos
    });
  } catch (error) {
    console.error('❌ Erro ao listar grupos:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * POST /api/wpp/enviar
 * Envia mensagem
 *
 * Body: {
 *   "para": "5573XXXXXXXX@s.whatsapp.net",
 *   "mensagem": "Texto da mensagem"
 * }
 */
router.post('/enviar', async (req, res) => {
  const { sock, conectado } = req.app.locals;
  const { para, mensagem } = req.body;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  if (!para || !mensagem) {
    return res.status(400).json({ erro: 'Parâmetros "para" e "mensagem" são obrigatórios' });
  }

  try {
    // Enviar mensagem
    await sock.sendMessage(para, { text: mensagem });

    console.log(`✅ Mensagem enviada via API para ${para}`);

    res.json({
      sucesso: true,
      para,
      enviadoEm: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * POST /api/wpp/marcar-lida
 * Marca mensagem como lida
 *
 * Body: {
 *   "jid": "5573XXXXXXXX@s.whatsapp.net"
 * }
 */
router.post('/marcar-lida', async (req, res) => {
  const { sock, conectado } = req.app.locals;
  const { jid } = req.body;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  if (!jid) {
    return res.status(400).json({ erro: 'Parâmetro "jid" é obrigatório' });
  }

  try {
    await sock.readMessages([{ remoteJid: jid, id: '*' }]);

    res.json({
      sucesso: true,
      jid
    });
  } catch (error) {
    console.error('❌ Erro ao marcar como lida:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/wpp/grupo-info/:codigo
 * Converte código de convite em JID e retorna info do grupo
 */
router.get('/grupo-info/:codigo', async (req, res) => {
  const { sock, conectado } = req.app.locals;
  const { codigo } = req.params;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  if (!codigo) {
    return res.status(400).json({ erro: 'Parâmetro "codigo" é obrigatório' });
  }

  try {
    // Obter informações do grupo via código de convite
    const info = await sock.groupGetInviteInfo(codigo);

    res.json({
      jid: info.id,
      nome: info.subject,
      criador: info.creator,
      criacao: info.creation,
      tamanho: info.size,
      descricao: info.desc
    });
  } catch (error) {
    console.error('❌ Erro ao obter info do grupo:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/wpp/mensagens-grupo/:jid
 * Busca mensagens de um grupo específico direto do WhatsApp
 */
router.get('/mensagens-grupo/:jid', async (req, res) => {
  const { sock, conectado } = req.app.locals;
  const { jid } = req.params;
  const limite = parseInt(req.query.limite) || 50;

  if (!conectado || !sock) {
    return res.status(503).json({ erro: 'WhatsApp não conectado' });
  }

  try {
    // Buscar mensagens direto do servidor WhatsApp
    const mensagens = await sock.fetchMessagesFromWA(jid, limite);

    const historico = mensagens.map(msg => ({
      id: msg.key.id,
      de: msg.key.fromMe ? 'eu' : (msg.pushName || msg.key.participant?.split('@')[0] || 'Desconhecido'),
      participante: msg.key.participant,
      texto: msg.message?.conversation ||
             msg.message?.extendedTextMessage?.text ||
             msg.message?.imageMessage?.caption ||
             msg.message?.videoMessage?.caption ||
             '[mídia]',
      timestamp: msg.messageTimestamp,
      data: new Date(msg.messageTimestamp * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    }));

    res.json({
      jid,
      total: historico.length,
      mensagens: historico.reverse() // Mais antigas primeiro
    });
  } catch (error) {
    console.error('❌ Erro ao buscar mensagens do grupo:', error.message);
    res.status(500).json({ erro: error.message });
  }
});

export default router;
