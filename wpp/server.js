// ============================================================
// SERVER.JS — Allmax®2605222230
// Inicialização, conexão WhatsApp e rotas HTTP
// ============================================================

import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'
import pkg from 'pg'
import { rm } from 'fs/promises'

import { handleRenomearGrupos } from './renomear-grupos.js'

import { handleCriarOuAtualizarGrupo } from './criar-ou-atualizar-grupo.js'

import retornoRoutes from './msg_externa.js'

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'

import { processarFila } from './fila.js'
import { sincronizarGruposAgenda } from './grupos.js'
import { ehComandoCalendario, handleCalendario } from './comandos/calendario.js'
import { ehComandoRetorno, estaAguardandoRetorno, handleRetorno, handleConfirmacaoRetorno } from './comandos/retorno.js'
import { tratarComandoSaida } from './comandos/saida.js'

const { Pool } = pkg
const VERSAO_WPP = 'Allmax®2605242125'

const app = express()
const PORT = process.env.PORT || 8080

app.use(express.json())
app.use('/msg_externa', retornoRoutes)

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

let sock = null
let qrAtual = null
let conectado = false
let iniciando = false

let ultimoEvento = null
let ultimaConexaoEm = null
let ultimaDesconexaoEm = null
let motivoDesconexao = null
let ultimoQrEm = null
let ultimaFalhaEnvioEm = null
let erroUltimoEnvio = null
let ultimaMensagemEnviadaEm = null
let processandoFila = false
const iniciadoEm = new Date()

async function limparSessao() {
  await rm('/data/auth_info', { recursive: true, force: true })
  console.log('🧹 Sessão apagada.')
}

async function iniciarBot() {
  if (iniciando) return
  iniciando = true

  console.log('🚀 Iniciando bot WhatsApp...')

  try {
    const { state, saveCreds } = await useMultiFileAuthState('/data/auth_info')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      logger: P({ level: 'silent' }),
      syncFullHistory: false,
      markOnlineOnConnect: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update
      const statusCode = lastDisconnect?.error?.output?.statusCode

      console.log('🔥 UPDATE:', {
        connection,
        qr: qr ? 'QR_GERADO' : undefined,
        statusCode,
        error: lastDisconnect?.error?.message
      })

      if (qr) {
        qrAtual = qr
        conectado = false
        ultimoQrEm = new Date().toISOString()
        ultimoEvento = 'QR_GERADO'
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp conectado!')
        conectado = true
        qrAtual = null
        ultimoEvento = 'CONECTADO'
        ultimaConexaoEm = new Date().toISOString()
        motivoDesconexao = null
      }

      if (connection === 'close') {
        conectado = false
        iniciando = false
        ultimoEvento = 'DESCONECTADO'
        ultimaDesconexaoEm = new Date().toISOString()
        motivoDesconexao = lastDisconnect?.error?.message || null

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          await limparSessao()
          qrAtual = null
          setTimeout(iniciarBot, 3000)
          return
        }

        setTimeout(iniciarBot, 8000)
      }
    })

    // ============================================================
    // LISTENER DE MENSAGENS
    // ============================================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        try {
          if (!msg.key.remoteJid?.endsWith('@g.us')) continue
          if (msg.key.fromMe) continue

          const grupoId = msg.key.remoteJid
          // Remetente: em grupos vem em msg.key.participant
          const remetente = msg.key.participant || msg.key.remoteJid
          const texto = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
          ).trim()

          if (!texto) continue

          // ============================================================
          // Comando Saída — SSS / colaborador
          // ============================================================
          const saidaTratada = await tratarComandoSaida(sock, pool, grupoId, remetente, texto)
          if (saidaTratada) {
            continue
          }

          // Aguardando confirmação de retorno
          if (estaAguardandoRetorno(grupoId)) {
            await handleConfirmacaoRetorno(sock, pool, grupoId, texto)
            continue
          }

          // Comando Calendário
          if (ehComandoCalendario(texto)) {
            await handleCalendario(sock, pool, grupoId)
            continue
          }

          // Comando Retorno
          if (ehComandoRetorno(texto)) {
            await handleRetorno(sock, pool, grupoId, remetente)
            continue
          }

         } catch (err) {
          console.error('Erro ao processar mensagem:', err.message)
          try {
            await sock.sendMessage(grupoId, { text: `🔴 ERRO: ${err.message}` })
          } catch {}
        }
      }
    })

  } catch (err) {
    console.error('💥 Erro ao iniciar bot:', err)
    iniciando = false
    setTimeout(iniciarBot, 8000)
  }
}

// ============================================================
// ROTAS HTTP
// ============================================================

app.get('/', (req, res) => {
  res.send(`
    <h1>WPP Bot rodando 🚀</h1>
    <p>Status: ${conectado ? 'Conectado ✅' : 'Aguardando conexão ⏳'}</p>
    <p>Versão: ${VERSAO_WPP}</p>
    <p><a href="/status">Status</a></p>
    <p><a href="/qr">QR Code</a></p>
    <p><a href="/grupos">Listar grupos</a></p>
    <p><a href="/sincronizar-grupos-agenda">Sincronizar grupos agenda</a></p>
  `)
})

app.get('/status', async (req, res) => {
  let pendentes = null
  let numero = null
  let nome = null

  try {
    const rs = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.wpp_fila_agenda WHERE status = 'pendente'`
    )
    pendentes = rs.rows[0].total
  } catch (err) {
    console.error('Erro ao consultar fila pendente:', err.message)
  }

  try {
    numero = sock?.user?.id?.split(':')[0] || null
    nome = sock?.user?.name || sock?.user?.verifiedName || ''
  } catch (err) {
    numero = null
    nome = ''
  }

  const mem = process.memoryUsage()
  let statusConexao = 'desconectado'
  if (conectado) statusConexao = 'conectado'
  else if (qrAtual) statusConexao = 'aguardando_qr'
  else if (iniciando) statusConexao = 'iniciando'

  res.json({
    online: true,
    whatsappConectado: conectado,
    statusConexao,
    qrDisponivel: !!qrAtual,
    filaPendentes: pendentes,
    filaProcessando: processandoFila,
    numeroConectado: numero,
    nomePerfil: nome,
    ultimoEvento,
    ultimaConexaoEm,
    ultimaDesconexaoEm,
    motivoDesconexao,
    ultimoQrEm,
    ultimaMensagemEnviadaEm,
    ultimaFalhaEnvioEm,
    erroUltimoEnvio,
    versao: VERSAO_WPP,
    horaServidor: new Date().toISOString(),
    uptimeSegundos: Math.floor(process.uptime()),
    iniciadoEm: iniciadoEm.toISOString(),
    nodeEnv: process.env.NODE_ENV || null,
    ambiente: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'production',
    railwayInstance: process.env.RAILWAY_REPLICA_ID || process.env.HOSTNAME || null,
    pid: process.pid,
    memoriaUsoMB: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024)
    }
  })
})

app.get('/reset-sessao', async (req, res) => {
  try {
    conectado = false
    qrAtual = null
    ultimoEvento = 'RESET_SESSAO_FORCADO'
    motivoDesconexao = 'Reset manual de sessão para troca de celular'
    try { if (sock) await sock.logout() } catch (e) { console.log('Logout ignorado:', e.message) }
    sock = null
    await rm('./auth_info_baileys', { recursive: true, force: true })
    setTimeout(() => { iniciarBot() }, 2000)
    res.json({ sucesso: true, mensagem: 'Sessão apagada. Aguarde alguns segundos e gere um novo QR.' })
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message })
  }
})

app.get('/qr', async (req, res) => {
  if (conectado) return res.send('<h2>WhatsApp já conectado ✅</h2>')
  if (!qrAtual) return res.send('<h2>QR ainda não gerado... ⏳</h2>')
  const qrImage = await QRCode.toDataURL(qrAtual)
  res.send(`<h2>Escaneie o QR Code</h2><img src="${qrImage}" style="width:320px;height:320px;" />`)
})

app.get('/reset', async (req, res) => {
  conectado = false
  qrAtual = null
  iniciando = false
  await limparSessao()
  setTimeout(iniciarBot, 1000)
  res.send('<h2>Sessão resetada. Aguarde e abra /qr novamente.</h2>')
})

app.get('/grupos', async (req, res) => {
  try {
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const grupos = await sock.groupFetchAllParticipating()
    const lista = Object.values(grupos).map(g => ({
      nome: g.subject, id: g.id, participantes: g.participants?.length || 0
    }))
    res.json(lista)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.get('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const resultado = await sincronizarGruposAgenda(pool, sock, conectado)
    res.json({ sucesso: true, metodo: 'GET', ...resultado })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const resultado = await sincronizarGruposAgenda(pool, sock, conectado)
    res.json({ sucesso: true, metodo: 'POST', ...resultado })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.get('/testar-rota-grupo', async (req, res) => {
  try {
    const pb = Number(req.query.pb)
    const cota = String(req.query.cota || '').trim().toUpperCase()
    if (!pb) return res.status(400).json({ erro: 'Informe o PB. Exemplo: /testar-rota-grupo?pb=576&cota=X4' })

    const rsCota = await pool.query(
      `SELECT pb, cota, nomegrupowpp, grupowppid FROM public.wpp_grupos_agenda
        WHERE pb = $1 AND UPPER(COALESCE(cota, '')) = UPPER($2) LIMIT 1`,
      [pb, cota]
    )
    if (rsCota.rowCount > 0) return res.json({ encontrado: true, tipo: 'cota', pb, cota, grupo: rsCota.rows[0] })

    const rsGeral = await pool.query(
      `SELECT pb, cota, nomegrupowpp, grupowppid FROM public.wpp_grupos_agenda
        WHERE pb = $1 AND cota IS NULL LIMIT 1`,
      [pb]
    )
    if (rsGeral.rowCount > 0) return res.json({ encontrado: true, tipo: 'fallback_pb', pb, cota, grupo: rsGeral.rows[0] })

    return res.status(404).json({ encontrado: false, pb, cota, erro: 'Nenhum grupo encontrado para este PB/Cota' })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/fila', async (req, res) => {
  try {
    const { grupo_id, mensagem } = req.body
    if (!grupo_id || !mensagem) return res.status(400).json({ erro: 'grupo_id e mensagem são obrigatórios' })
    await pool.query(
      `INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status) VALUES ($1, $2, 'pendente')`,
      [grupo_id, mensagem]
    )
    res.json({ sucesso: true })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/enviar-grupo', async (req, res) => {
  try {
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const { grupoId, mensagem } = req.body
    if (!grupoId || !mensagem) return res.status(400).json({ erro: 'grupoId e mensagem são obrigatórios' })
    await sock.sendMessage(grupoId, { text: mensagem })
    res.json({ sucesso: true, destino: grupoId })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.get('/botao_agenda_todos', async (req, res) => {
  try {
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const grupoId = '120363330197701730@g.us'
    const linkAgenda = 'https://allmaxcalendar.vercel.app/egfxddachch'
    await sock.sendMessage(grupoId, {
      text: `📅 *Agenda disponível*\n\nClique abaixo para acessar:\n\n${linkAgenda}`
    })
    res.json({ sucesso: true, tipo: 'link_clicavel', destino: grupoId, link: linkAgenda })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/renomear-grupos', (req, res) => {
  handleRenomearGrupos(req, res, () => sock, () => conectado)
})

app.post('/criar-ou-atualizar-grupo', (req, res) => {
  handleCriarOuAtualizarGrupo(req, res, () => sock, () => conectado)
})
// ============================================================
// INICIALIZAÇÃO
// ============================================================

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`)
  iniciarBot()

  setInterval(async () => {
    processandoFila = true
    await processarFila(pool, sock, conectado, {
      onEnviado: () => { ultimaMensagemEnviadaEm = new Date().toISOString() },
      onErro: (msg) => { ultimaFalhaEnvioEm = new Date().toISOString(); erroUltimoEnvio = msg }
    }).catch(console.error)
    processandoFila = false
  }, 10000)
})
