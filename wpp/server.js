import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'
import { rm } from 'fs/promises'

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

async function limparSessao() {
  try {
    await rm('./auth_info', { recursive: true, force: true })
    console.log('🧹 Sessão apagada.')
  } catch (e) {
    console.log('Sessão já limpa.')
  }
}

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
        iniciando = false

        console.log('❌ Conexão fechada. Código:', statusCode)

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log('🚪 Sessão inválida. Limpando e gerando novo QR...')
          await limparSessao()
          qrAtual = null

          setTimeout(() => {
            iniciarBot()
          }, 3000)

          return
        }

        console.log('🔄 Reconectando em 8 segundos...')
        setTimeout(() => {
          iniciarBot()
        }, 8000)
      }
    })
  } catch (err) {
    console.error('💥 Erro ao iniciar bot:', err)
    iniciando = false

    setTimeout(() => {
      iniciarBot()
    }, 8000)
  }
}

app.get('/', (req, res) => {
  res.send(`
    <h1>WPP Bot rodando 🚀</h1>
    <p>Status: ${conectado ? 'Conectado ✅' : 'Aguardando QR/conexão ⏳'}</p>
    <p><a href="/qr">Ver QR Code</a></p>
    <p><a href="/status">Status JSON</a></p>
    <p><a href="/reset">Resetar sessão</a></p>
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
      <p>Aguarde alguns segundos e atualize.</p>
    `)
  }

  const qrImage = await QRCode.toDataURL(qrAtual)

  res.send(`
    <h2>Escaneie o QR Code</h2>
    <img src="${qrImage}" style="width:320px;height:320px;" />
    <p>WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
  `)
})

app.get('/reset', async (req, res) => {
  conectado = false
  qrAtual = null
  iniciando = false

  await limparSessao()

  setTimeout(() => {
    iniciarBot()
  }, 1000)

  res.send('<h2>Sessão resetada. Aguarde e abra /qr novamente.</h2>')
})

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`)
  iniciarBot()
})
