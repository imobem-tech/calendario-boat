import express from 'express'
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

const app = express()
const PORT = process.env.PORT || 8080

let qrAtual = null
let conectado = false

async function startBot() {
    console.log('🚀 Iniciando bot...')

    const { state, saveCreds } = await useMultiFileAuthState('auth_info')

    const sock = makeWASocket({
        auth: state,
        browser: ['WPP Bot', 'Chrome', '1.0.0']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update

        console.log('🔥 UPDATE:', update)

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
            console.log('❌ Conexão fechada.')
            conectado = false
            console.log('Motivo:', lastDisconnect?.error?.message)

            setTimeout(() => {
                startBot()
            }, 5000)
        }
    })
}

startBot()

app.get('/', (req, res) => {
    res.send(`
        <h1>WPP Bot rodando 🚀</h1>
        <p>Status: ${conectado ? 'Conectado ✅' : 'Aguardando conexão ⏳'}</p>
        <p><a href="/qr">Ver QR Code</a></p>
    `)
})

app.get('/qr', async (req, res) => {
    if (conectado) {
        return res.send('<h2>WhatsApp já conectado ✅</h2>')
    }

    if (!qrAtual) {
        return res.send('<h2>QR ainda não gerado... ⏳</h2><p>Atualize em alguns segundos.</p>')
    }

    const qrImage = await QRCode.toDataURL(qrAtual)

    res.send(`
        <h2>Escaneie o QR Code</h2>
        <img src="${qrImage}" style="width:320px;height:320px;" />
        <p>Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.</p>
    `)
})

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`)
})
