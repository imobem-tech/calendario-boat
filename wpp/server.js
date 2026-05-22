
import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'
import pkg from 'pg'
import { rm } from 'fs/promises'
import retornoRoutes from "./msg_externa.js";

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'
 
const { Pool } = pkg
const VERSAO_WPP = "Allmax®2604240031"

const app = express()
const PORT = process.env.PORT || 8080


app.use(express.json())
app.use("/msg_externa", retornoRoutes);

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

let sock = null
let qrAtual = null
let conectado = false
let iniciando = false
let processandoFila = false

let ultimoEvento = null
let ultimaConexaoEm = null
let ultimaDesconexaoEm = null
let motivoDesconexao = null
let ultimoQrEm = null
let ultimaFalhaEnvioEm = null
let erroUltimoEnvio = null
let ultimaMensagemEnviadaEm = null
const iniciadoEm = new Date()

async function processarFila() {
  if (processandoFila) return
  if (!conectado || !sock) return

  processandoFila = true

  try {
    const rs = await pool.query(`
      SELECT id, grupo_id, mensagem
      FROM public.wpp_fila_agenda
      WHERE status = 'pendente'
      ORDER BY id
      LIMIT 5
    `)

    for (const row of rs.rows) {
      try {
        await sock.sendMessage(row.grupo_id, { text: row.mensagem })

        await pool.query(`
          UPDATE public.wpp_fila_agenda
          SET status = 'enviado',
              enviado_em = NOW(),
              erro = NULL
          WHERE id = $1
        `, [row.id])

        ultimaMensagemEnviadaEm = new Date().toISOString()

      } catch (err) {
        const erroMsg = err?.message || String(err)

        await pool.query(`
          UPDATE public.wpp_fila_agenda
          SET status = 'erro',
              erro = $2
          WHERE id = $1
        `, [row.id, erroMsg])

        ultimaFalhaEnvioEm = new Date().toISOString()
        erroUltimoEnvio = erroMsg
      }
    }

  } catch (err) {
    console.error('Erro geral ao processar fila:', err)
  } finally {
    processandoFila = false
  }
}

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
  console.log('🧹 Sessão apagada.')
}

// ============================================================
// GERAÇÃO DE TOKEN DO DIA (válido apenas no dia atual)
// Formato: [PB] [LetraGrupo] [NumGrupo] [CodAutorizado] [MMDD] [DV]
// Codificação: a=1,b=2,c=3,d=4,e=5,f=6,g=7,h=8,i=9,j=0
// ============================================================
const MAP_ENC = { '1':'a','2':'b','3':'c','4':'d','5':'e','6':'f','7':'g','8':'h','9':'i','0':'j' }

function encodificar(num) {
  return String(num).split('').map(d => MAP_ENC[d] || '').join('')
}

function calcularDVToken(pb, grupoNum, autorizado, mmdd) {
  const base = `${pb}${grupoNum}${autorizado}${mmdd}`
  const soma = base.split('').reduce((acc, n) => acc + Number(n), 0)
  return String(soma).padStart(2, '0')
}

function gerarToken(pb, grupoLetra, codAutorizado) {
  const matchGrupo = String(grupoLetra).match(/^([A-Za-z])(\d+)$/)
  if (!matchGrupo) throw new Error(`Formato de grupo inválido: ${grupoLetra}`)

  const letra = matchGrupo[1].toLowerCase()
  const grupoNum = matchGrupo[2]

  // MMDD do dia atual no horário Brasil
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const mm = String(agora.getMonth() + 1).padStart(2, '0')
  const dd = String(agora.getDate()).padStart(2, '0')
  const mmdd = `${mm}${dd}`

  const pbLimpo = String(Math.round(pb))
  const autLimpo = String(Math.round(codAutorizado)).padStart(4, '0')
  const numLimpo = String(grupoNum)

  const dv = calcularDVToken(pbLimpo, numLimpo, autLimpo, mmdd)

  return (
    encodificar(pbLimpo) +
    letra +
    encodificar(numLimpo) +
    encodificar(autLimpo) +
    encodificar(mmdd) +
    encodificar(dv)
  )
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
    // LISTENER DE MENSAGENS — comando CCC gera link com token
    // ============================================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        try {
          // Só processa mensagens de grupos
          if (!msg.key.remoteJid?.endsWith('@g.us')) continue

          // Ignora mensagens próprias do bot
          if (msg.key.fromMe) continue

          // Extrai o texto da mensagem
          const texto = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
          ).trim()

          // Detecta padrão: 3 ou mais C seguidos (maiúsculo ou minúsculo), sem outros caracteres
          if (!/^c{3,}$/i.test(texto)) continue

          const grupoId = msg.key.remoteJid

          console.log(`📅 Comando CCC recebido no grupo ${grupoId}`)

          // Busca pb e cota pelo grupowppid
          const rsGrupo = await pool.query(
            `SELECT pb, COALESCE(cota, '01') AS cota
               FROM public.wpp_grupos_agenda
              WHERE grupowppid = $1
              LIMIT 1`,
            [grupoId]
          )

          if (rsGrupo.rowCount === 0) {
            console.log(`⚠️ Grupo ${grupoId} não encontrado em wpp_grupos_agenda`)
            continue
          }

          const pb = rsGrupo.rows[0].pb
          const cota = rsGrupo.rows[0].cota

          // Busca o autorizado ativo para pb + grupo



                    const rsAut = await pool.query(
  `SELECT "Cod_Pessoa" AS cod_pessoa, "Gropo_letra" AS gropo_letra
     FROM public."P_BOAT_4_Autorizados"
    WHERE "Cod_Embarcacao" = $1
      AND UPPER("Gropo_letra") = UPPER($2)
      AND "Dt_Desautorizacao" IS NULL
      AND "Dt_Cancelamento" IS NULL
    LIMIT 1`,
  [pb, cota]
)

          const codAutorizado = rsAut.rows[0].cod_pessoa
const grupoLetra = rsAut.rows[0].gropo_letra

          if (rsAut.rowCount === 0) {
            console.log(`⚠️ Nenhum autorizado ativo para PB ${pb} / Cota ${cota}`)
            await sock.sendMessage(grupoId, {
              text: `⚠️ Nenhum autorizado ativo encontrado para esta embarcação.\nContate o administrador.`
            })
            continue
          }


          // Gera token do dia com MMDD embutido
          const token = gerarToken(pb, grupoLetra, codAutorizado)
          const BASE_URL = process.env.BASE_URL_AGENDA || 'https://allmaxcalendar.vercel.app'
          const link = `${BASE_URL}/agendar?t=${token}`

          await sock.sendMessage(grupoId, {
            text: `📅 *Link de agendamento do dia*\n\n${link}\n\n_Válido somente hoje_`
          })

          console.log(`✅ Token gerado para PB ${pb} / ${grupoLetra} — enviado para ${grupoId}`)

        } catch (err) {
          console.error('Erro ao processar mensagem CCC:', err.message)
        }
      }
    })

  } catch (err) {
    console.error('💥 Erro ao iniciar bot:', err)
    iniciando = false
    setTimeout(iniciarBot, 8000)
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
    let removidos = 0

    const idsAtuais = []

    await client.query(`
      DROP INDEX IF EXISTS ux_wpp_grupos_agenda_pb_cota
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wpp_grupos_agenda_grupowppid
      ON public.wpp_grupos_agenda (grupowppid)
    `)

    for (const g of Object.values(grupos)) {
      const item = extrairGrupoAgenda(g.subject, g.id)

      if (!item) {
        ignorados++
        continue
      }

      idsAtuais.push(item.grupoWppId)

      const rsExiste = await client.query(
        `SELECT id
           FROM public.wpp_grupos_agenda
          WHERE grupowppid = $1
          LIMIT 1`,
        [item.grupoWppId]
      )

      if (rsExiste.rowCount === 0) {
        await client.query(
          `INSERT INTO public.wpp_grupos_agenda
           (pb, cota, nomegrupowpp, grupowppid, dataatualizacao)
           VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'America/Sao_Paulo')`,
          [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId]
        )
        inseridos++
      } else {
        await client.query(
          `UPDATE public.wpp_grupos_agenda
              SET pb = $1,
                  cota = $2,
                  nomegrupowpp = $3,
                  dataatualizacao = NOW() AT TIME ZONE 'America/Sao_Paulo'
            WHERE grupowppid = $4`,
          [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId]
        )
        atualizados++
      }
    }

    if (idsAtuais.length > 0) {
      const rsDelete = await client.query(
        `DELETE FROM public.wpp_grupos_agenda
          WHERE NOT (grupowppid = ANY($1::text[]))`,
        [idsAtuais]
      )

      removidos = rsDelete.rowCount
    }

    return { inseridos, atualizados, ignorados, removidos }

  } finally {
    client.release()
  }
}

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
      `SELECT COUNT(*)::int AS total
         FROM public.wpp_fila_agenda
        WHERE status = 'pendente'`
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

  if (conectado) {
    statusConexao = 'conectado'
  } else if (qrAtual) {
    statusConexao = 'aguardando_qr'
  } else if (iniciando) {
    statusConexao = 'iniciando'
  }


  
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

    try {
      if (sock) {
        await sock.logout()
      }
    } catch (e) {
      console.log('Logout ignorado:', e.message)
    }

    sock = null

    await rm('./auth_info_baileys', { recursive: true, force: true })

    setTimeout(() => {
      iniciarBot()
    }, 2000)

    res.json({
      sucesso: true,
      mensagem: 'Sessão apagada. Aguarde alguns segundos e gere um novo QR.'
    })

  } catch (err) {
    res.status(500).json({
      sucesso: false,
      erro: err.message
    })
  }
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

app.get('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const resultado = await sincronizarGruposAgenda()
    res.json({ sucesso: true, metodo: 'GET', ...resultado })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const resultado = await sincronizarGruposAgenda()
    res.json({ sucesso: true, metodo: 'POST', ...resultado })
  } catch (err) {
    res.status(500).json({ erro: err.message })
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
      `SELECT pb, cota, nomegrupowpp, grupowppid
         FROM public.wpp_grupos_agenda
        WHERE pb = $1
          AND UPPER(COALESCE(cota, '')) = UPPER($2)
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
      `SELECT pb, cota, nomegrupowpp, grupowppid
         FROM public.wpp_grupos_agenda
        WHERE pb = $1
          AND cota IS NULL
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

app.post('/fila', async (req, res) => {
  try {
    const { grupo_id, mensagem } = req.body

    if (!grupo_id || !mensagem) {
      return res.status(400).json({
        erro: 'grupo_id e mensagem são obrigatórios'
      })
    }

    await pool.query(
      `INSERT INTO public.wpp_fila_agenda
       (grupo_id, mensagem, status)
       VALUES ($1, $2, 'pendente')`,
      [grupo_id, mensagem]
    )

    res.json({ sucesso: true })

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

app.get('/botao_agenda_todos', async (req, res) => {
  try {
    if (!conectado || !sock) {
      return res.status(503).json({ erro: 'WhatsApp não conectado' })
    }

    const grupoId = '120363330197701730@g.us'
    const linkAgenda = 'https://allmaxcalendar.vercel.app/egfxddachch'

    await sock.sendMessage(grupoId, {
      text:
`📅 *Agenda disponível*

Clique abaixo para acessar:

${linkAgenda}`
    })

    res.json({
      sucesso: true,
      tipo: 'link_clicavel',
      destino: grupoId,
      link: linkAgenda
    })

  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`)
  iniciarBot()

  setInterval(() => {
    processarFila().catch(console.error)
  }, 10000)
})
