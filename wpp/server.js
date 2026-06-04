// ============================================================
// wpp/server.js — V.2606022405
// Allmax Gestão de Cotas — Marujo⚓
// Inicialização, conexão WhatsApp e rotas HTTP
// + Localização em tempo real: tracking + ranking
// + Sistema 70m: ÚNICA forma de retorno via geo (<70m + autorização)
// REBUILD: Forçando deploy limpo (Railway cache fix)
// ============================================================

// Carrega .env apenas em desenvolvimento (Railway usa variáveis de ambiente diretas)
if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT) {
  try {
    await import('dotenv/config')
  } catch (err) {
    console.warn('⚠️ dotenv não encontrado (ok em produção com variáveis de ambiente)')
  }
}

import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import QRCode from 'qrcode'
import P from 'pino'
import pkg from 'pg'
import { rm } from 'fs/promises'

import {
  handleAlterarGrupo,
  tratarConfirmacaoGrupoCerto
} from './renomear-grupos.js'
import { handleColaboradoresGrupo, handleColaboradoresTodos, handleAdicionarTitular } from './grupos-admin.js'
import { handleCriarOuAtualizarGrupo } from './criar-ou-atualizar-grupo.js'

import retornoRoutes from './msg_externa.js'

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'

import { processarFila } from './fila.js'
import { obterPrevisaoNavegacao, parsearComandoPrevisao, enviarPrevisaoDiaria } from './previsao.js'
import { sincronizarGruposAgenda } from './grupos.js'
import { ehComandoCalendario, handleCalendario } from './comandos/calendario.js'
import { ehComandoRetorno, estaAguardandoRetorno, handleRetorno, handleConfirmacaoRetorno } from './comandos/retorno.js'
import { tratarComandoHoraMotor } from './comandos/hora_motor.js'
import { tratarComandoSaida, buscarColaborador } from './comandos/saida.js'
import { tratarComandoAdmin, ehGrupoAdm } from './comandos/admin.js'
import { enviarAlertasHMRetornoPendente } from './alerta_hm_retorno.js'
import { handleLocalizacao, verificarPosicoesExpiradas, verificarPosicoes70Metros, enviarPerguntaConfirmacao70m, buscarRankingAtual, atualizarRankingEmTodosGrupos } from './localizacao.js'


const { Pool } = pkg
const VERSAO_WPP = 'Allmax®2606022405'
console.log('VERSAO SERVER:', VERSAO_WPP)

const app = express()
const PORT = process.env.PORT || 8080

// ============================================================
// CORS: Permitir requisições do Vercel
// V.2606041450
// ============================================================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }

  next()
})

// ============================================================
// SISTEMA 70m: Estado em memória para confirmações pendentes
// ============================================================
const aguardandoConfirmacao70m = new Map()
// Chave: grupoId
// Valor: { agendamentoId, pb, cota, ultimaPergunta, tentativas }

// Resolver caminho absoluto para ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Servir arquivos estáticos da pasta public (mapa de rastreamento)
// public/ está na raiz do projeto (um nível acima de wpp/)
const publicPath = path.join(__dirname, '..', 'public')
console.log('📁 Working directory:', process.cwd())
console.log('📁 __dirname:', __dirname)
console.log('📁 Servindo arquivos estáticos de:', publicPath)
app.use(express.static(publicPath))

app.use(express.json())
app.use('/msg_externa', retornoRoutes)

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
})

let sock = null
let qrAtual = null
let conectado = false
let iniciando = false

let ultimoEvento = null
let ultimaConexaoEm = null
let ultimaDesconexaoEm = null
let motivoDesconexao = null
let ultimoQrEm = null
let ultimaFalhaEnvioEm = null
let erroUltimoEnvio = null
let ultimaMensagemEnviadaEm = null
let processandoFila = false
const iniciadoEm = new Date()

async function limparSessao() {
  await rm('/data/auth_info', { recursive: true, force: true })
  console.log('🧹 Sessão apagada.')
}

// ============================================================
// SISTEMA 70m: Handler de confirmação S/N
// ============================================================
async function handleConfirmacao70m(sock, pool, grupoId, texto, remetente) {
  const estado = aguardandoConfirmacao70m.get(grupoId)
  if (!estado) return false

  // Validar se é colaborador
  const colaborador = await buscarColaborador(pool, remetente)
  if (!colaborador) {
    console.log(`⚠️ Resposta S/N ignorada: ${remetente} não é colaborador`)
    return true // Consumiu mensagem mas ignorou
  }

  const textoNorm = texto.trim().toLowerCase()

  // ============================================================
  // Resposta: S (SIM - Confirmar retorno)
  // ============================================================
  if (/^s$/i.test(textoNorm)) {
    try {
      // Registrar retorno
      await pool.query(
        `UPDATE public."P_BOAT_z_10_Saida_Emb"
         SET "Dt_Retorno" = NOW() AT TIME ZONE 'America/Sao_Paulo'
         WHERE "ID" = $1`,
        [estado.agendamentoId]
      )

      const agora = new Date()
      const dataRetorno = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      const horaRetorno = agora.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit'
      })

      const timestamp = agora.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

      const mensagem = `✅ *RETORNO CONFIRMADO*

RETORNO_${timestamp}
${dataRetorno} ${horaRetorno}
${colaborador.nome}
Emb ${estado.pb}-${estado.cota}

Sistema 70m

${VERSAO_WPP}`

      await sock.sendMessage(grupoId, { text: mensagem })
      aguardandoConfirmacao70m.delete(grupoId)

      console.log(`✅ Retorno 70m confirmado: ${estado.pb}-${estado.cota}`)
      return true

    } catch (erro) {
      console.error('❌ Erro ao registrar retorno 70m:', erro)
      await sock.sendMessage(grupoId, {
        text: `❌ Erro ao registrar retorno. Tente novamente ou use RRR.\n\n${VERSAO_WPP}`
      })
      aguardandoConfirmacao70m.delete(grupoId)
      return true
    }
  }

  // ============================================================
  // Resposta: N (NÃO - Aguardar 5 minutos)
  // ============================================================
  if (/^n$/i.test(textoNorm)) {
    await sock.sendMessage(grupoId, {
      text: `❌ Retorno não confirmado\n\nNova confirmação em 5 minutos.\n\n${VERSAO_WPP}`
    })
    aguardandoConfirmacao70m.delete(grupoId)
    console.log(`❌ Retorno 70m negado: ${estado.pb}-${estado.cota}`)
    return true
  }

  // Não é S nem N: ignora
  return false
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
    // LISTENER DE MENSAGENS
    // ============================================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        try {
          if (!msg.key.remoteJid?.endsWith('@g.us')) continue
          if (msg.key.fromMe) continue

          const grupoId = msg.key.remoteJid
          // Remetente: em grupos vem em msg.key.participant
          const remetente = msg.key.participant || msg.key.remoteJid

          // ============================================================
          // LOCALIZAÇÃO EM TEMPO REAL → Retorno automático + Ranking
          // ============================================================
          if (await handleLocalizacao(sock, pool, grupoId, msg)) continue

          const texto = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
          ).trim()

          if (!texto) continue

          // ============================================================
          // Grupo Administrativo — roteamento exclusivo
          // ============================================================
          if (ehGrupoAdm(grupoId)) {
            await tratarComandoAdmin(sock, pool, grupoId, remetente, texto)
            continue
          }

          const horaMotorTratado = await tratarComandoHoraMotor(
  sock, pool, grupoId, remetente, texto, buscarColaborador
)
if (horaMotorTratado) continue

          // ============================================================
          // Comando Saída — SSS / colaborador
          // ============================================================
          const saidaTratada = await tratarComandoSaida(sock, pool, grupoId, remetente, texto)
          if (saidaTratada) {
            continue
          }

          // ============================================================
          // Sistema 70m: Confirmação S/N de retorno semi-automático
          // ============================================================
          if (aguardandoConfirmacao70m.has(grupoId)) {
            const respondeu = await handleConfirmacao70m(sock, pool, grupoId, texto, remetente)
            if (respondeu) continue
          }

          // Aguardando confirmação de retorno
          if (estaAguardandoRetorno(grupoId)) {
            await handleConfirmacaoRetorno(sock, pool, grupoId, texto)
            continue
          }

          // Comando Previsão do tempo — ppp / ppp 02
          const cmdPrevisao = parsearComandoPrevisao(texto)
          if (cmdPrevisao.valido) {
            if (cmdPrevisao.erro) {
              await sock.sendMessage(grupoId, { text: cmdPrevisao.erro })
            } else {
              const previsao = await obterPrevisaoNavegacao(cmdPrevisao.diasAFrente)
              await sock.sendMessage(grupoId, { text: previsao })
            }
            continue
          }

          // Comando Calendário
          if (ehComandoCalendario(texto)) {
            await handleCalendario(sock, pool, grupoId)
            continue
          }

          // Comando Retorno
          if (ehComandoRetorno(texto)) {
            await handleRetorno(sock, pool, grupoId, remetente)
            continue
          }

         } catch (err) {
          console.error('Erro ao processar mensagem:', err.message)
          try {
            await sock.sendMessage(grupoId, { text: `🔴 ERRO: ${err.message}` })
          } catch {}
        }
      }
    })

  } catch (err) {
    console.error('💥 Erro ao iniciar bot:', err)
    iniciando = false
    setTimeout(iniciarBot, 8000)
  }
}

// ============================================================
// ROTAS HTTP
// ============================================================

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
      `SELECT COUNT(*)::int AS total FROM public.wpp_fila_agenda WHERE status = 'pendente'`
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
  if (conectado) statusConexao = 'conectado'
  else if (qrAtual) statusConexao = 'aguardando_qr'
  else if (iniciando) statusConexao = 'iniciando'

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
    try { if (sock) await sock.logout() } catch (e) { console.log('Logout ignorado:', e.message) }
    sock = null
    await rm('./auth_info_baileys', { recursive: true, force: true })
    setTimeout(() => { iniciarBot() }, 2000)
    res.json({ sucesso: true, mensagem: 'Sessão apagada. Aguarde alguns segundos e gere um novo QR.' })
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message })
  }
})

// ============================================================
// ENDPOINT DEBUG: Verificar barcos simulados no banco
// ============================================================
app.get('/debug-simulados', async (req, res) => {
  try {
    const rsAgendamentos = await pool.query(`
      SELECT "ID", "Cod_Emb_PB", "Grupo_Comp_letra",
             "Dt_Agendamento", "Dt_Saída", "Dt_Retorno"
      FROM public."P_BOAT_z_10_Saida_Emb"
      WHERE "Cod_Emb_PB" >= 100 AND "Cod_Emb_PB" < 120
      ORDER BY "Cod_Emb_PB"
    `)

    const rsLocalizacoes = await pool.query(`
      SELECT id, agendamento_id, pb, cota,
             latitude, longitude, distancia_porto_m, criado_em
      FROM public.wpp_localizacao_emb
      WHERE pb >= 100 AND pb < 120
      ORDER BY pb
    `)

    res.json({
      sucesso: true,
      agendamentos: rsAgendamentos.rows,
      localizacoes: rsLocalizacoes.rows,
      totalAgendamentos: rsAgendamentos.rowCount,
      totalLocalizacoes: rsLocalizacoes.rowCount
    })
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message })
  }
})

// ============================================================
// ENDPOINT: Mostrar estrutura da tabela
// ============================================================
app.get('/schema-localizacao', async (req, res) => {
  try {
    const rs = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'wpp_localizacao_emb'
      ORDER BY ordinal_position
    `)
    res.json({ sucesso: true, colunas: rs.rows })
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message })
  }
})

// ============================================================
// ENDPOINT: Executar simulação de 20 barcos
// ============================================================
app.get('/simular-fila', async (req, res) => {
  try {
    console.log('🎬 [SIMULAÇÃO] Criando 20 barcos...')

    // Buscar um Cod_Autorizado válido do banco
    const rsAuth = await pool.query(`SELECT "Codigo" FROM public."Cliente" LIMIT 1`)
    const codAutorizado = rsAuth.rows[0]?.Codigo || 1

    console.log('🧹 Limpando barcos simulados antigos...')

    // Limpar simulações anteriores
    const rsDelLoc = await pool.query(`DELETE FROM public.wpp_localizacao_emb WHERE pb >= 100 AND pb < 120`)
    const rsDelAg = await pool.query(`DELETE FROM public."P_BOAT_z_10_Saida_Emb" WHERE "Cod_Emb_PB" >= 100 AND "Cod_Emb_PB" < 120`)

    console.log(`   🗑️  ${rsDelLoc.rowCount} localizações removidas`)
    console.log(`   🗑️  ${rsDelAg.rowCount} agendamentos removidos`)

    const barcosCriados = []

    // Criar 20 barcos com distribuição específica
    for (let i = 0; i < 20; i++) {
      const pb = 100 + i
      const cota = i % 2 === 0 ? `X${i + 1}` : null

      let dist, bearing

      // 2 primeiros barcos: 100m fixo
      if (i < 2) {
        dist = 100
        bearing = i === 0 ? 45 : 135 // Primeiro NE, segundo SE
      }
      // Restantes 18 barcos: 200-1500m distribuídos em 3 setores
      else {
        // Distância uniforme entre 200-1500m
        dist = 200 + Math.floor((1300 / 17) * (i - 2))

        // Distribuir em 3 setores: Nordeste (45°), Leste (90°), Sudeste (135°)
        const setor = (i - 2) % 3
        if (setor === 0) {
          // Nordeste: 30° a 60° (±15° de variação)
          bearing = 45 + (Math.random() * 30 - 15)
        } else if (setor === 1) {
          // Leste: 75° a 105° (±15° de variação)
          bearing = 90 + (Math.random() * 30 - 15)
        } else {
          // Sudeste: 120° a 150° (±15° de variação)
          bearing = 135 + (Math.random() * 30 - 15)
        }
      }

      // Calcular lat/lon
      const bearingRad = bearing * Math.PI / 180
      const lat = -10.21101 + (dist * Math.cos(bearingRad)) / 111320.0
      const lon = -48.36912 + (dist * Math.sin(bearingRad)) / (111320.0 * Math.cos(-10.21101 * Math.PI / 180))

      // Criar agendamento
      const rsAg = await pool.query(`
        INSERT INTO public."P_BOAT_z_10_Saida_Emb" (
          "Cod_Emb_PB",
          "Grupo_Comp_letra",
          "Dt_Agendamento",
          "Dt_Saída",
          "Cod_Autorizado"
        ) VALUES ($1, $2, NOW() AT TIME ZONE 'America/Sao_Paulo', NOW() AT TIME ZONE 'America/Sao_Paulo', $3)
        RETURNING "ID"
      `, [pb, cota, codAutorizado])

      const agId = rsAg.rows[0].ID

      // Inserir localização - ESTRUTURA CORRETA DA TABELA
      // Campos: id(auto), agendamento_id, pb, cota, latitude, longitude, distancia_porto_m, criado_em(auto)
      await pool.query(`
        INSERT INTO public.wpp_localizacao_emb (
          agendamento_id,
          pb,
          cota,
          latitude,
          longitude,
          distancia_porto_m
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [agId, pb, cota, lat, lon, Math.round(dist)])

      barcosCriados.push({
        pb,
        cota,
        distancia: Math.round(dist),
        latitude: lat.toFixed(6),
        longitude: lon.toFixed(6)
      })

      console.log(`   ✅ ${pb}-${cota || '?'}: ${Math.round(dist)}m (${lat.toFixed(6)}, ${lon.toFixed(6)})`)
    }

    console.log('🎉 [SIMULAÇÃO] 20 barcos criados!')

    // MODO TESTE: NÃO envia no WhatsApp automaticamente
    // Para enviar manualmente: acesse /testar-ranking
    res.json({
      sucesso: true,
      mensagem: '20 barcos simulados criados (MODO TESTE - WhatsApp DESABILITADO)',
      barcos: barcosCriados,
      rankingEnviado: false,
      aviso: '⚠️ WhatsApp DESABILITADO durante testes. Use /testar-ranking para enviar manualmente.'
    })

  } catch (erro) {
    console.error('❌ [SIMULAÇÃO] Erro:', erro)
    res.status(500).json({ sucesso: false, erro: erro.message })
  }
})

// ============================================================
// ENDPOINT DE TESTE: Forçar envio de ranking manualmente
// ============================================================
app.get('/testar-ranking', async (req, res) => {
  try {
    if (!conectado || !sock) {
      return res.status(503).json({
        sucesso: false,
        erro: 'WhatsApp não conectado'
      })
    }

    console.log('🧪 [TESTE] Forçando envio de ranking...')

    // Buscar ranking atual
    const ranking = await buscarRankingAtual(pool)

    // Enviar para todos os grupos
    await atualizarRankingEmTodosGrupos(sock, pool, ranking)

    console.log('✅ [TESTE] Ranking enviado para todos os grupos!')

    res.json({
      sucesso: true,
      mensagem: 'Ranking enviado para todos os grupos!',
      totalBarcos: ranking.length
    })

  } catch (erro) {
    console.error('❌ [TESTE] Erro ao enviar ranking:', erro)
    res.status(500).json({
      sucesso: false,
      erro: erro.message
    })
  }
})

app.get('/qr', async (req, res) => {
  if (conectado) return res.send('<h2>WhatsApp já conectado ✅</h2>')
  if (!qrAtual) return res.send('<h2>QR ainda não gerado... ⏳</h2>')
  const qrImage = await QRCode.toDataURL(qrAtual)
  res.send(`<h2>Escaneie o QR Code</h2><img src="${qrImage}" style="width:320px;height:320px;" />`)
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
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const grupos = await sock.groupFetchAllParticipating()
    const lista = Object.values(grupos).map(g => ({
      nome: g.subject, id: g.id, participantes: g.participants?.length || 0
    }))
    res.json(lista)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

// Rota de debug para verificar arquivos na pasta public
app.get('/debug-files', (req, res) => {
  const publicPath = path.join(__dirname, '..', 'public')

  try {
    const files = fs.readdirSync(publicPath)
    res.json({
      cwd: process.cwd(),
      __dirname,
      publicPath,
      filesExist: files,
      rastrearExists: fs.existsSync(path.join(publicPath, 'rastrear.html'))
    })
  } catch (err) {
    // Se falhou, listar o que TEM no diretório pai
    try {
      const parentDir = path.join(__dirname, '..')
      const dirFiles = fs.readdirSync(parentDir)
      res.status(500).json({
        error: err.message,
        cwd: process.cwd(),
        __dirname,
        parentDir,
        publicPath,
        filesInParent: dirFiles
      })
    } catch (err2) {
      res.status(500).json({
        error: err.message,
        error2: err2.message,
        cwd: process.cwd(),
        __dirname
      })
    }
  }
})

app.get('/rastrear', async (req, res) => {
  try {
    const rs = await pool.query(`
      WITH saidas_hoje AS (
        SELECT
          s."ID" as agendamento_id,
          s."Cod_Emb_PB" as pb,
          s."Grupo_Comp_letra" as cota,
          c."Cliente_Nome" as nome_autorizado
        FROM public."P_BOAT_z_10_Saida_Emb" s
        LEFT JOIN public."Cliente" c ON c."Codigo" = s."Cod_Autorizado"
        WHERE DATE(s."Dt_Agendamento" AT TIME ZONE 'America/Sao_Paulo') =
              (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
          AND s."Dt_Saída" IS NOT NULL
          AND s."Dt_Retorno" IS NULL
          AND s."Dt_Desistencia" IS NULL
          AND s."Dt_Cancela_saida" IS NULL
      ),
      ultimas_posicoes AS (
        SELECT DISTINCT ON (agendamento_id)
          agendamento_id,
          latitude,
          longitude,
          distancia_porto_m,
          criado_em
        FROM public.wpp_localizacao_emb
        WHERE agendamento_id IN (SELECT agendamento_id FROM saidas_hoje)
        ORDER BY agendamento_id, criado_em DESC
      )
      SELECT
        s.*,
        p.latitude,
        p.longitude,
        p.distancia_porto_m,
        p.criado_em as ultima_atualizacao
      FROM saidas_hoje s
      LEFT JOIN ultimas_posicoes p ON p.agendamento_id = s.agendamento_id
      WHERE p.latitude IS NOT NULL
    `)

    res.json({
      sucesso: true,
      embarcacoes: rs.rows,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.get('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const resultado = await sincronizarGruposAgenda(pool, sock, conectado)
    res.json({ sucesso: true, metodo: 'GET', ...resultado })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/sincronizar-grupos-agenda', async (req, res) => {
  try {
    const resultado = await sincronizarGruposAgenda(pool, sock, conectado)
    res.json({ sucesso: true, metodo: 'POST', ...resultado })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.get('/testar-rota-grupo', async (req, res) => {
  try {
    const pb = Number(req.query.pb)
    const cota = String(req.query.cota || '').trim().toUpperCase()
    if (!pb) return res.status(400).json({ erro: 'Informe o PB. Exemplo: /testar-rota-grupo?pb=576&cota=X4' })

    const rsCota = await pool.query(
      `SELECT pb, cota, nomegrupowpp, grupowppid FROM public.wpp_grupos_agenda
        WHERE pb = $1 AND UPPER(COALESCE(cota, '')) = UPPER($2) LIMIT 1`,
      [pb, cota]
    )
    if (rsCota.rowCount > 0) return res.json({ encontrado: true, tipo: 'cota', pb, cota, grupo: rsCota.rows[0] })

    const rsGeral = await pool.query(
      `SELECT pb, cota, nomegrupowpp, grupowppid FROM public.wpp_grupos_agenda
        WHERE pb = $1 AND cota IS NULL LIMIT 1`,
      [pb]
    )
    if (rsGeral.rowCount > 0) return res.json({ encontrado: true, tipo: 'fallback_pb', pb, cota, grupo: rsGeral.rows[0] })

    return res.status(404).json({ encontrado: false, pb, cota, erro: 'Nenhum grupo encontrado para este PB/Cota' })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/fila', async (req, res) => {
  try {
    const { grupo_id, mensagem } = req.body
    if (!grupo_id || !mensagem) return res.status(400).json({ erro: 'grupo_id e mensagem são obrigatórios' })
    await pool.query(
      `INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status) VALUES ($1, $2, 'pendente')`,
      [grupo_id, mensagem]
    )
    res.json({ sucesso: true })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/enviar-grupo', async (req, res) => {
  try {
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const { grupoId, mensagem } = req.body
    if (!grupoId || !mensagem) return res.status(400).json({ erro: 'grupoId e mensagem são obrigatórios' })
    await sock.sendMessage(grupoId, { text: mensagem })
    res.json({ sucesso: true, destino: grupoId })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.post('/enviar-jid', async (req, res) => {
  try {
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const { jid, mensagem } = req.body
    if (!jid || !mensagem) return res.status(400).json({ erro: 'jid e mensagem são obrigatórios' })

    let jidFinal = jid
    // Para privados (@s.whatsapp.net), resolve via onWhatsApp para obter JID correto (@lid ou @s.whatsapp.net)
    if (!jid.endsWith('@g.us')) {
      const tel = jid.replace(/@.*$/, '')
      try {
        const [r] = await sock.onWhatsApp(tel)
        if (r?.exists) {
          jidFinal = r.jid
          console.log(`[enviar-jid] JID resolvido: ${jid} → ${jidFinal}`)
        } else {
          console.warn(`[enviar-jid] Número ${tel} não encontrado no WhatsApp`)
        }
      } catch (errOW) {
        console.warn(`[enviar-jid] onWhatsApp falhou para ${tel}:`, errOW.message)
      }
    }

    await sock.sendMessage(jidFinal, { text: mensagem })
    res.json({ sucesso: true, destino: jidFinal })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

app.get('/botao_agenda_todos', async (req, res) => {
  try {
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const grupoId = '120363330197701730@g.us'
    const linkAgenda = 'https://allmaxcalendar.vercel.app/egfxddachch'
    await sock.sendMessage(grupoId, {
      text: `📅 *Agenda disponível*\n\nClique abaixo para acessar:\n\n${linkAgenda}`
    })
    res.json({ sucesso: true, tipo: 'link_clicavel', destino: grupoId, link: linkAgenda })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})



app.post('/grupos/renomear', (req, res) => {
  handleAlterarGrupo(req, res, () => sock, () => conectado)
})

app.post('/grupos/alterar', (req, res) => {
  handleAlterarGrupo(req, res, () => sock, () => conectado)
})

app.post('/grupos/colaboradores/grupo', (req, res) => {
  handleColaboradoresGrupo(req, res, () => sock, () => conectado)
})

app.post('/grupos/colaboradores/todos', (req, res) => {
  handleColaboradoresTodos(req, res, () => sock, () => conectado)
})

app.post('/grupos/titular', (req, res) => {
  handleAdicionarTitular(req, res, () => sock, () => conectado)
})

app.post('/criar-ou-atualizar-grupo', (req, res) => {
  handleCriarOuAtualizarGrupo(req, res, () => sock, () => conectado)
})

// ============================================================
// ENDPOINT: Previsão do tempo para WEB
// V.2606041440
// ============================================================
app.post('/previsao', async (req, res) => {
  try {
    console.log('[PREVISAO_WEB] Requisição recebida:', req.body)

    const { diasAFrente = 0 } = req.body

    // Validar dias à frente (0 a 15)
    if (typeof diasAFrente !== 'number' || diasAFrente < 0 || diasAFrente > 15) {
      console.log('[PREVISAO_WEB] Validação falhou:', diasAFrente)
      return res.status(400).json({ erro: 'diasAFrente deve estar entre 0 e 15' })
    }

    console.log('[PREVISAO_WEB] Buscando previsão para diasAFrente:', diasAFrente)
    const previsao = await obterPrevisaoNavegacao(diasAFrente, diasAFrente === 0)

    console.log('[PREVISAO_WEB] Previsão obtida, tamanho:', previsao?.length || 0)
    res.json({ sucesso: true, previsao })
  } catch (err) {
    console.error('[PREVISAO_WEB] Erro:', err.message)
    console.error('[PREVISAO_WEB] Stack:', err.stack)
    res.status(500).json({ erro: err.message })
  }
})

app.post('/previsao/teste', async (req, res) => {
  try {
    if (!conectado || !sock) return res.status(503).json({ erro: 'WhatsApp não conectado' })
    const { grupowppid } = req.body
    if (!grupowppid) return res.status(400).json({ erro: 'grupowppid é obrigatório' })
    const previsao = await obterPrevisaoNavegacao(0, true)
    await sock.sendMessage(grupowppid, { text: previsao })
    res.json({ sucesso: true, enviado: grupowppid })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})
// ============================================================
// INICIALIZAÇÃO
// ============================================================

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`)
  iniciarBot()

  setInterval(async () => {
    processandoFila = true
    await processarFila(pool, sock, conectado, {
      onEnviado: () => { ultimaMensagemEnviadaEm = new Date().toISOString() },
      onErro: (msg) => { ultimaFalhaEnvioEm = new Date().toISOString(); erroUltimoEnvio = msg }
    }).catch(console.error)
    processandoFila = false
  }, 10000)


let alertaHMUltimaData = ''

setInterval(async () => {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hora  = agora.getHours()
  const hoje  = agora.toISOString().slice(0, 10)

  if (hora === 11 && alertaHMUltimaData !== hoje) {
    alertaHMUltimaData = hoje
    console.log('[HM_PENDENTE] Iniciando verificação diária das 11h...')
    await enviarAlertasHMRetornoPendente(pool, sock, conectado).catch(console.error)
  }
}, 60000)

  // ============================================================
  // Sistema 70m: Verificação periódica a cada 5 minutos
  // ============================================================
  setInterval(async () => {
    if (!conectado || !sock) return
    try {
      await verificarPosicoes70Metros(sock, pool, aguardandoConfirmacao70m)
    } catch (erro) {
      console.error('❌ Erro na verificação 70m:', erro)
    }
  }, 5 * 60 * 1000) // 5 minutos


  // Previsão diária às 8h — controla data para não enviar mais de uma vez por dia
  let previsaoDiariaUltimaData = ''
  setInterval(async () => {
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const hora  = agora.getHours()
    const hoje  = agora.toISOString().slice(0, 10)
    if (hora === 8 && previsaoDiariaUltimaData !== hoje) {
      previsaoDiariaUltimaData = hoje
      console.log('[PREVISAO] Iniciando envio diário das 8h...')
      await enviarPrevisaoDiaria(pool, sock, conectado).catch(console.error)
    }
  }, 60000)

  // ============================================================
  // VERIFICAÇÃO DE POSIÇÕES EXPIRADAS
  // A cada 1 minuto SE tiver fila ativa
  // Dorme se não houver ninguém compartilhando localização
  // ============================================================
  let intervaloPosicoes = null

  async function verificarEAgendar() {
    if (!conectado || !sock) return

    const resultado = await verificarPosicoesExpiradas(sock, pool).catch(err => {
      console.error('[EXPIRAÇÃO] Erro na verificação:', err.message)
      return { temFilaAtiva: true, expirados: 0 }
    })

    if (!resultado.temFilaAtiva && intervaloPosicoes) {
      // Fila vazia - dorme
      console.log('[EXPIRAÇÃO] Fila vazia - pausando verificações')
      clearInterval(intervaloPosicoes)
      intervaloPosicoes = null
    } else if (resultado.temFilaAtiva && !intervaloPosicoes) {
      // Fila ativa mas intervalo não está rodando - reativar
      console.log('[EXPIRAÇÃO] Fila ativa - ativando verificações a cada 1 min')
      intervaloPosicoes = setInterval(verificarEAgendar, 60000) // 1 minuto
    }
  }

  // Primeira verificação após 1 minuto de boot
  setTimeout(verificarEAgendar, 60000)
})
