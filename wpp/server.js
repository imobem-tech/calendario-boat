import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'
import pkg from 'pg'
import { rm } from 'fs/promises'

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'

const { Pool } = pkg
const VERSAO_WPP = "Allmax®2604240031";
const app = express()
const PORT = process.env.PORT || 8080

app.use(express.json())

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

let sock = null
let qrAtual = null
let conectado = false
let iniciando = false
let processandoFila = false

function extrairGrupoAgenda(nome, grupoId) {
  const nomeLimpo = String(nome || '').trim()

  // ignora se os 3 primeiros caracteres não forem números
  if (!/^\d{3}/.test(nomeLimpo)) {
    return null
  }

  // 1ª opção: NNN-AN
  // exemplos: 576-Y2, 573-X4, 586-R4
  const comCota = nomeLimpo.match(/^(\d{3})-([A-Z]\d)\b/i)

  if (comCota) {
    return {
      pb: Number(comCota[1]),
      cota: comCota[2].toUpperCase(),
      nomeGrupoWpp: nomeLimpo,
      grupoWppId: grupoId
    }
  }

  // 2ª opção: NNN qualquer coisa
  // exemplos: 555 SUMMER, 672-SUMMER, 643 SUMMER
  const semCota = nomeLimpo.match(/^(\d{3})/)

  return {
    pb: Number(semCota[1]),
    cota: null,
    nomeGrupoWpp: nomeLimpo,
    grupoWppId: grupoId
  }
}

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
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp conectado!')
        conectado = true
        qrAtual = null
      }

      if (connection === 'close') {
        conectado = false
        iniciando = false

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          await limparSessao()
          qrAtual = null
          setTimeout(iniciarBot, 3000)
          return
        }

        setTimeout(iniciarBot, 8000)
      }
    })
  } catch (err) {
    console.error('💥 Erro ao iniciar bot:', err)
    iniciando = false
    setTimeout(iniciarBot, 8000)
  }
}

async function processarFila() {
  if (processandoFila) return
  if (!conectado || !sock) return

  processandoFila = true
  let client

  try {
    client = await pool.connect()

    const rs = await client.query(
      `SELECT id, grupo_id, mensagem
         FROM public.wpp_fila_agenda
        WHERE status = 'pendente'
          AND tentativas < 5
        ORDER BY id
        LIMIT 5`
    )

    for (const row of rs.rows) {
      try {
        console.log(`📤 Enviando mensagem fila ID ${row.id} para ${row.grupo_id}`)

        await sock.sendMessage(row.grupo_id, {
          text: row.mensagem
        })

        await client.query(
          `UPDATE public.wpp_fila_agenda
              SET status = 'enviado',
                  enviado_em = NOW(),
                  erro = NULL
            WHERE id = $1`,
          [row.id]
        )

        console.log(`✅ Mensagem ID ${row.id} enviada.`)

      } catch (err) {
        console.error(`❌ Erro ao enviar ID ${row.id}:`, err.message)

        await client.query(
          `UPDATE public.wpp_fila_agenda
              SET tentativas = tentativas + 1,
                  erro = $2
            WHERE id = $1`,
          [row.id, err.message]
        )
      }
    }
  } catch (err) {
    console.error('💥 Erro geral ao processar fila:', err.message)
  } finally {
    if (client) client.release()
    processandoFila = false
  }
}

app.get('/', (req, res) => {
  res.send(`
    <h1>WPP Bot rodando 🚀</h1>
    <p>Status: ${conectado ? 'Conectado ✅' : 'Aguardando conexão ⏳'}</p>
    <p><a href="/status">Status</a></p>
    <p><a href="/qr">QR Code</a></p>
    <p><a href="/grupos">Listar grupos</a></p>
  `)
})

app.get('/status', async (req, res) => {
  let pendentes = null

  try {
    const rs = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM public.wpp_fila_agenda
        WHERE status = 'pendente'`
    )
    pendentes = rs.rows[0].total
  } catch {}

  res.json({
    online: true,
    whatsappConectado: conectado,
    qrDisponivel: !!qrAtual,
    filaPendentes: pendentes
  })
})

app.get('/qr', async (req, res) => {
  if (conectado) {
    return res.send('<h2>WhatsApp já conectado ✅</h2>')
  }

  if (!qrAtual) {
    return res.send('<h2>QR ainda não gerado... ⏳</h2>')
  }

  const qrImage = await QRCode.toDataURL(qrAtual)

  res.send(`
    <h2>Escaneie o QR Code</h2>
    <img src="${qrImage}" style="width:320px;height:320px;" />
  `)
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
    if (!conectado || !sock) {
      return res.status(503).json({ erro: 'WhatsApp não conectado' })
    }

    const grupos = await sock.groupFetchAllParticipating()

    const lista = Object.values(grupos).map(g => ({
      nome: g.subject,
      id: g.id,
      participantes: g.participants?.length || 0
    }))

    res.json(lista)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/sincronizar-grupos-agenda', async (req, res) => {
  let client

  try {
    if (!conectado || !sock) {
      return res.status(503).json({ erro: 'WhatsApp não conectado' })
    }

    const grupos = await sock.groupFetchAllParticipating()

    client = await pool.connect()

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wpp_grupos_agenda_pb_cota
      ON "WPP_Grupos_Agenda" (PB, COALESCE(Cota, ''))
    `)

    let inseridos = 0
    let atualizados = 0
    let ignorados = 0

    const processados = []

    for (const g of Object.values(grupos)) {
      const item = extrairGrupoAgenda(g.subject, g.id)

      if (!item) {
        ignorados++
        continue
      }

      const rsExiste = await client.query(
        `SELECT ID
           FROM "WPP_Grupos_Agenda"
          WHERE PB = $1
            AND COALESCE(Cota, '') = COALESCE($2, '')
          LIMIT 1`,
        [item.pb, item.cota]
      )

      if (rsExiste.rowCount === 0) {
        await client.query(
          `INSERT INTO "WPP_Grupos_Agenda"
           (PB, Cota, NomeGrupoWpp, GrupoWppId, DataAtualizacao)
           VALUES ($1, $2, $3, $4, NOW())`,
          [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId]
        )

        inseridos++
      } else {
        await client.query(
          `UPDATE "WPP_Grupos_Agenda"
              SET NomeGrupoWpp = $3,
                  GrupoWppId = $4,
                  DataAtualizacao = NOW()
            WHERE PB = $1
              AND COALESCE(Cota, '') = COALESCE($2, '')`,
          [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId]
        )

        atualizados++
      }

      processados.push(item)
    }

    res.json({
      sucesso: true,
      inseridos,
      atualizados,
      ignorados,
      totalProcessados: processados.length,
      exemplos: processados.slice(0, 20)
    })

  } catch (err) {
    res.status(500).json({ erro: err.message })
  } finally {
    if (client) client.release()
  }
})

app.get('/testar-rota-grupo', async (req, res) => {
  try {
    const pb = Number(req.query.pb)
    const cota = String(req.query.cota || '').trim().toUpperCase()

    if (!pb) {
      return res.status(400).json({
        erro: 'Informe o PB. Exemplo: /testar-rota-grupo?pb=576&cota=X4'
      })
    }

    const rsCota = await pool.query(
      `SELECT PB, Cota, NomeGrupoWpp, GrupoWppId
         FROM public.wpp_grupos_agenda
        WHERE PB = $1
          AND UPPER(COALESCE(Cota, '')) = UPPER($2)
        LIMIT 1`,
      [pb, cota]
    )

    if (rsCota.rowCount > 0) {
      return res.json({
        encontrado: true,
        tipo: 'cota',
        pb,
        cota,
        grupo: rsCota.rows[0]
      })
    }

    const rsGeral = await pool.query(
      `SELECT PB, Cota, NomeGrupoWpp, GrupoWppId
         FROM public.wpp_grupos_agenda
        WHERE PB = $1
          AND Cota IS NULL
        LIMIT 1`,
      [pb]
    )

    if (rsGeral.rowCount > 0) {
      return res.json({
        encontrado: true,
        tipo: 'fallback_pb',
        pb,
        cota,
        grupo: rsGeral.rows[0]
      })
    }

    return res.status(404).json({
      encontrado: false,
      pb,
      cota,
      erro: 'Nenhum grupo encontrado para este PB/Cota'
    })

  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/enviar-grupo', async (req, res) => {
  try {
    if (!conectado || !sock) {
      return res.status(503).json({ erro: 'WhatsApp não conectado' })
    }

    const { grupoId, mensagem } = req.body

    if (!grupoId || !mensagem) {
      return res.status(400).json({ erro: 'grupoId e mensagem são obrigatórios' })
    }

    await sock.sendMessage(grupoId, { text: mensagem })

    res.json({ sucesso: true, destino: grupoId })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`)
  iniciarBot()

  setInterval(() => {
    processarFila()
  }, 10000)
})
