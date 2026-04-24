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

  if (!/^\d{3}/.test(nomeLimpo)) return null

  const comCota = nomeLimpo.match(/^(\d{3})-([A-Z]\d)\b/i)
  if (comCota) {
    return {
      pb: Number(comCota[1]),
      cota: comCota[2].toUpperCase(),
      nomeGrupoWpp: nomeLimpo,
      grupoWppId: grupoId
    }
  }

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
}

async function iniciarBot() {
  if (iniciando) return
  iniciando = true

  try {
    const { state, saveCreds } = await useMultiFileAuthState('/data/auth_info')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      logger: P({ level: 'silent' })
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update
      const statusCode = lastDisconnect?.error?.output?.statusCode

      if (qr) {
        qrAtual = qr
        conectado = false
      }

      if (connection === 'open') {
        conectado = true
        qrAtual = null
      }

      if (connection === 'close') {
        conectado = false
        iniciando = false

        if (statusCode === DisconnectReason.loggedOut) {
          await limparSessao()
          setTimeout(iniciarBot, 3000)
          return
        }

        setTimeout(iniciarBot, 8000)
      }
    })
  } catch {
    iniciando = false
    setTimeout(iniciarBot, 8000)
  }
}

async function processarFila() {
  if (processandoFila || !conectado || !sock) return
  processandoFila = true

  let client

  try {
    client = await pool.connect()

    const rs = await client.query(`
      SELECT id, grupo_id, mensagem
      FROM public.wpp_fila_agenda
      WHERE status = 'pendente'
      ORDER BY id
      LIMIT 5
    `)

    for (const row of rs.rows) {
      try {
        await sock.sendMessage(row.grupo_id, { text: row.mensagem })

        await client.query(`
          UPDATE public.wpp_fila_agenda
          SET status = 'enviado', enviado_em = NOW()
          WHERE id = $1
        `, [row.id])

      } catch (err) {
        await client.query(`
          UPDATE public.wpp_fila_agenda
          SET tentativas = tentativas + 1, erro = $2
          WHERE id = $1
        `, [row.id, err.message])
      }
    }
  } finally {
    if (client) client.release()
    processandoFila = false
  }
}

async function sincronizarGruposAgenda() {
  if (!conectado || !sock) {
    throw new Error('WhatsApp não conectado')
  }

  const grupos = await sock.groupFetchAllParticipating()
  const client = await pool.connect()

  try {
    let inseridos = 0
    let atualizados = 0
    let ignorados = 0

    for (const g of Object.values(grupos)) {
      const item = extrairGrupoAgenda(g.subject, g.id)

      if (!item) {
        ignorados++
        continue
      }

      const rsExiste = await client.query(`
        SELECT id
        FROM public.wpp_grupos_agenda
        WHERE pb = $1
          AND COALESCE(cota, '') = COALESCE($2, '')
        LIMIT 1
      `, [item.pb, item.cota])

      if (rsExiste.rowCount === 0) {
        await client.query(`
          INSERT INTO public.wpp_grupos_agenda
          (pb, cota, nomegrupowpp, grupowppid, dataatualizacao)
          VALUES ($1, $2, $3, $4, NOW())
        `, [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId])
        inseridos++
      } else {
        await client.query(`
          UPDATE public.wpp_grupos_agenda
          SET nomegrupowpp = $3,
              grupowppid = $4,
              dataatualizacao = NOW()
          WHERE pb = $1
            AND COALESCE(cota, '') = COALESCE($2, '')
        `, [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId])
        atualizados++
      }
    }

    return { inseridos, atualizados, ignorados }
  } finally {
    client.release()
  }
}

app.get('/status', async (req, res) => {
  res.json({ conectado })
})

app.get('/qr', async (req, res) => {
  if (!qrAtual) return res.send('Sem QR')
  const qr = await QRCode.toDataURL(qrAtual)
  res.send(`<img src="${qr}" />`)
})

app.get('/grupos', async (req, res) => {
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
})

app.get('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const r = await sincronizarGruposAgenda()
    res.json({ sucesso: true, ...r })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const r = await sincronizarGruposAgenda()
    res.json({ sucesso: true, ...r })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.get('/testar-rota-grupo', async (req, res) => {
  try {
    const pb = Number(req.query.pb)
    const cota = String(req.query.cota || '').toUpperCase()

    const rs = await pool.query(`
      SELECT *
      FROM public.wpp_grupos_agenda
      WHERE pb = $1
        AND UPPER(COALESCE(cota,'')) = UPPER($2)
      LIMIT 1
    `, [pb, cota])

    if (rs.rowCount > 0) {
      return res.json({ encontrado: true, tipo: 'cota', grupo: rs.rows[0] })
    }

    const rs2 = await pool.query(`
      SELECT *
      FROM public.wpp_grupos_agenda
      WHERE pb = $1 AND cota IS NULL
      LIMIT 1
    `, [pb])

    if (rs2.rowCount > 0) {
      return res.json({ encontrado: true, tipo: 'fallback', grupo: rs2.rows[0] })
    }

    res.json({ encontrado: false, pb, cota })

  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.listen(PORT, () => {
  iniciarBot()
  setInterval(processarFila, 10000)
})
