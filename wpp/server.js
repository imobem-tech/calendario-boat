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
        auth: state
    });

    sock.ev.on('connection.update', async (update) => {
    console.log("UPDATE:", update);
        const { connection, qr } = update;

        if (qr) {
            console.log('QR recebido!');
            qrAtual = await QRCode.toDataURL(qr);
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp conectado!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startBot();
