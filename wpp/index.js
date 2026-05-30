const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

// WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// QR Code
client.on('qr', (qr) => {
    console.log('ESCANEIE O QR CODE:');
    qrcode.generate(qr, { small: true });
});

// Conectado
client.on('ready', () => {
    console.log('WhatsApp conectado!');
});

// Endpoint para enviar mensagem
app.post('/enviar', async (req, res) => {
    const { grupo, mensagem } = req.body;

    try {
        const chats = await client.getChats();
        const chat = chats.find(c => c.isGroup && c.name === grupo);

        if (!chat) {
            return res.status(404).send('Grupo não encontrado');
        }

        await chat.sendMessage(mensagem);
        res.send('Mensagem enviada');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao enviar');
    }
});

// Teste
app.get('/', (req, res) => {
    res.send('WWP BOT rodando 🚀');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('Servidor rodando na porta', PORT);
});

client.initialize();
