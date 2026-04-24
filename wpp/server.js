const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

let qrAtual = null;

// 🚀 Iniciar servidor web
app.get('/', (req, res) => {
    res.send('<h1>WPP Bot rodando 🚀</h1><p><a href="/qr">Ver QR Code</a></p>');
});

// 📲 Rota do QR
app.get('/qr', (req, res) => {
    if (!qrAtual) return res.send('QR ainda não gerado...');
    res.send(`<img src="${qrAtual}" />`);
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

// 🤖 Conexão WhatsApp
async function startBot() {
    console.log("🚀 Iniciando bot...");
    const { state, saveCreds } = await useMultiFileAuthState('auth');

   const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,ock.ev.on('c
    browser: ['WPP Bot', 'Chrome', '1.0.0']
})

sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update

    console.log('UPDATE:', update)

    if (qr) {
        console.log('📱 QR GERADO!')
        latestQR = qr
    }

    if (connection === 'open') {
        console.log('✅ WhatsApp conectado!')
    }

    if (connection === 'close') {
        console.log('❌ Conexão fechada, reiniciando...')
        startSock()
    }
})

    sock.ev.on('creds.update', saveCreds);
}

startBot();
