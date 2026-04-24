import express from 'express'
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

const app = express()
const PORT = process.env.PORT || 8080

let qrAtual = null

async function startBot() {
    console.log('🚀 Iniciando bot...')

    // 🔑 CORREÇÃO PRINCIPAL
    const { state, sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update

    console.log('🔥 UPDATE COMPLETO:', update)

    if (qr) {
        console.log('📲 QR RECEBIDO!')
        qrAtual = qr
    }

    if (connection === 'open') {
        console.log('✅ WhatsApp conectado!')
    }

    if (connection === 'close') {
        console.log('❌ Conexão fechada.')
    }
})

    // 🔑 SALVA SESSÃO (IMPORTANTE)
    sock.ev.on('creds.update', saveCreds)
}

startBot()

app.get('/', (req, res) => {
    res.send(`
        <h1>WPP Bot rodando 🚀</h1>
        <p><a href="/qr">Ver QR Code</a></p>
    `)
})

app.get('/qr', async (req, res) => {
    if (!qrAtual) {
        return res.send('<h2>QR ainda não gerado... ⏳</h2>')
    }

    const qrImage = await QRCode.toDataURL(qrAtual)

    res.send(`
        <h2>Escaneie o QR Code</h2>
        <img src="${qrImage}" />
    `)
})

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`)
})
