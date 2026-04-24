import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'

const app = express()
const PORT = process.env.PORT || 8080

app.use(express.json())

let sock = null
let qrAtual = null
let conectado = false
let iniciando = false

async function iniciarBot() {
  if (iniciando) return

  iniciando = true
  console.log('🚀 Iniciando bot WhatsApp...')

  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
    const { version } = await fetchLatestBaileysVersion()

    console.log('📦 Baileys version:', version)

    sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      logger: P({ level: 'silent' }),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update

      console.log('🔥 UPDATE:', {
        connection,
        qr: qr ? 'QR_GERADO' : undefined,
        error: lastDisconnect?.error?.message
      })

      if (qr) {
        console.log('📲 QR RECEBIDO!')
        qrAtual = qr
        conectado = false
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp conectado!')
        conectado = true
        qrAtual = null
      }

      if (connection === 'close') {
        conectado = false

        const statusCode = lastDisconnect?.error?.output?.statusCode
        console.log('❌ Conexão fechada. Código:', statusCode)

        if (statusCode !== DisconnectReason.loggedOut) {
          console.log('🔄 Tentando reconectar em 10 segundos...')
          setTimeout(() => {
            iniciando = false
            iniciarBot()
          }, 10000)
        } else {
          console.log('🚪 Sessão encerrada. Precisa escanear novo QR.')
          qrAtual = null
          iniciando = false
        }
      }
    })
  } catch (err) {
    console.error('💥 Erro ao iniciar bot:', err)
    iniciando = false

    setTimeout(() => {
      iniciarBot()
    }, 10000)
  }
}

app.get('/', (req, res) => {
  res.send(`
    <h1>WPP Bot rodando 🚀</h1>
    <p>Status: ${conectado ? 'Conectado ✅' : 'Aguardando QR/conexão ⏳'}</p>
    <p><a href="/qr">Ver QR Code</a></p>
    <p><a href="/status">Status JSON</a></p>
  `)
})

app.get('/status', (req, res) => {
  res.json({
    online: true,
    whatsappConectado: conectado,
    qrDisponivel: !!qrAtual
  })
})

app.get('/qr', async (req, res) => {
  if (conectado) {
    return res.send('<h2>WhatsApp já conectado ✅</h2>')
  }

  if (!qrAtual) {
    return res.send(`
      <h2>QR ainda não gerado... ⏳</h2>
      <p>Aguarde alguns segundos e atualize a página.</p>
      <p><a href="/status">Ver status</a></p>
    `)
  }

  const qrImage = await QRCode.toDataURL(qrAtual)

  res.send(`
    <h2>Escaneie o QR Code</h2>
    <img src="${qrImage}" style="width:320px;height:320px;" />
    <p>WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
  `)
})

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`)
  iniciarBot()
})
