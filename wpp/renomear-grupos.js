// ============================================================
// ENDPOINT POST /renomear-grupo
// Renomeia (ou cria) grupos WhatsApp com base em P_BOAT_4_Autorizados
// ============================================================

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ADM1 = '_ADM_JRSN_20251008'; // JID do admin fixo 1 (obter via sock)
const ADM2 = '556332258473@s.whatsapp.net'; // Admin fixo 2

// -------------------------------------------------------
// Registra o sock do Baileys para uso nas funções
// -------------------------------------------------------
let _sock = null;
function setSock(sock) { _sock = sock; }

// -------------------------------------------------------
// Busca dados do banco: apenas registros ativos, sem X1, com jid
// -------------------------------------------------------
async function buscarRegistros() {
  const { rows } = await pool.query(`
    SELECT 
      a."Cod_Embarcacao",
      a."Gropo_letra",
      a."Cod_Pessoa",
      REPLACE(c."Cliente_Telefone_Celular", '+', '') || '@s.whatsapp.net' AS jid_dono
    FROM public."P_BOAT_4_Autorizados" a
    JOIN public."Cliente" c ON c."Codigo" = a."Cod_Pessoa"
    WHERE a."Dt_Desautorizacao" IS NULL
      AND a."Gropo_letra" != 'X1'
      AND c."Cliente_Telefone_Celular" IS NOT NULL
    ORDER BY a."Cod_Embarcacao", a."Gropo_letra"
  `);
  return rows;
}

// -------------------------------------------------------
// Busca todos os grupos WhatsApp participando
// -------------------------------------------------------
async function buscarGruposWhatsApp() {
  const grupos = await _sock.groupFetchAllParticipating();
  return Object.entries(grupos).map(([id, data]) => ({
    id,
    subject: data.subject,
    participants: data.participants.map(p => p.id),
  }));
}

// -------------------------------------------------------
// Para um Cod_Embarcacao, filtra grupos cujo nome começa com "{cod}-"
// -------------------------------------------------------
function filtrarGruposDaEmbarcacao(grupos, codEmbarcacao) {
  const prefixo = `${codEmbarcacao}-`;
  return grupos.filter(g => g.subject.startsWith(prefixo));
}

// -------------------------------------------------------
// Monta o novo nome: substitui só o prefixo "{cod}-" por "{cod}-{letra}-"
// Ex: "619-SUMMER MARINA-C" + letra "11" → "619-11-SUMMER MARINA-C"
// -------------------------------------------------------
function montarNovoNome(nomeAtual, codEmbarcacao, gropoLetra) {
  const prefixoAtual = `${codEmbarcacao}-`;
  const prefixoNovo  = `${codEmbarcacao}-${gropoLetra}-`;

  if (!nomeAtual.startsWith(prefixoAtual)) return null; // nome inesperado

  const resto = nomeAtual.slice(prefixoAtual.length);

  // Se o grupo já tem o formato correto (ex: "573-R1-..."), não remonta
  // Detecta se logo após o prefixo já vem o gropoLetra seguido de "-"
  if (resto.startsWith(`${gropoLetra}-`)) {
    return nomeAtual; // já está correto
  }

  return prefixoNovo + resto;
}

// -------------------------------------------------------
// Cria um novo grupo com o nome correto
// -------------------------------------------------------
async function criarGrupo(codEmbarcacao, gropoLetra, jidDono) {
  const nomeGrupo = `${codEmbarcacao}-${gropoLetra}-NOVO`;
  console.log(`[CRIAR] ${nomeGrupo} — dono: ${jidDono}`);

  // Resolve JID do ADM1 (precisa ser JID completo)
  const membros = [jidDono, ADM2].filter(Boolean);

  const result = await _sock.groupCreate(nomeGrupo, membros);

  // Promove todos a admin
  const novoId = result.id;
  await _sock.groupParticipantsUpdate(novoId, membros, 'promote');

  console.log(`[CRIADO] ${nomeGrupo} → ${novoId}`);
  return { acao: 'criado', grupoId: novoId, nomeGrupo };
}

// -------------------------------------------------------
// Handler principal do endpoint
// -------------------------------------------------------
export async function handleRenomearGrupos(req, res, getSock, getConectado) {
  const sock = getSock()
  const conectado = getConectado()
  const log = []
  try {
    const registros = await buscarRegistros();
    const grupos    = await buscarGruposWhatsApp();

    // Agrupa registros por Cod_Embarcacao
    const porEmbarcacao = {};
    for (const reg of registros) {
      const cod = reg.Cod_Embarcacao;
      if (!porEmbarcacao[cod]) porEmbarcacao[cod] = [];
      porEmbarcacao[cod].push(reg);
    }

    for (const [codStr, regs] of Object.entries(porEmbarcacao)) {
      const cod = parseInt(codStr);
      const gruposDoBarco = filtrarGruposDaEmbarcacao(grupos, cod);

      for (const reg of regs) {
        const { Gropo_letra, jid_dono } = reg;

        // ----- Caso 1: apenas 1 registro e 1 grupo → renomeia direto -----
        if (regs.length === 1 && gruposDoBarco.length === 1) {
          const grupo     = gruposDoBarco[0];
          const novoNome  = montarNovoNome(grupo.subject, cod, Gropo_letra);

          if (!novoNome) {
            log.push({ cod, Gropo_letra, status: 'SKIP', motivo: 'nome inesperado' });
            continue;
          }

          if (novoNome === grupo.subject) {
            log.push({ cod, Gropo_letra, status: 'JÁ OK', nome: novoNome });
            continue;
          }

          await _sock.groupUpdateSubject(grupo.id, novoNome);
          log.push({ cod, Gropo_letra, status: 'RENOMEADO', de: grupo.subject, para: novoNome });
          continue;
        }

        // ----- Caso 2: múltiplos registros/grupos → matching por celular -----
        const grupoMatch = gruposDoBarco.find(g =>
          g.participants.includes(jid_dono)
        );

        if (grupoMatch) {
          const novoNome = montarNovoNome(grupoMatch.subject, cod, Gropo_letra);

          if (!novoNome) {
            log.push({ cod, Gropo_letra, status: 'SKIP', motivo: 'nome inesperado' });
            continue;
          }

          if (novoNome === grupoMatch.subject) {
            log.push({ cod, Gropo_letra, status: 'JÁ OK', nome: novoNome });
            continue;
          }

          await _sock.groupUpdateSubject(grupoMatch.id, novoNome);
          log.push({ cod, Gropo_letra, status: 'RENOMEADO', de: grupoMatch.subject, para: novoNome });

        } else {
          // ----- Caso 3: sem grupo correspondente → cria novo -----
          if (!jid_dono) {
            log.push({ cod, Gropo_letra, status: 'SKIP', motivo: 'sem jid_dono' });
            continue;
          }

          const resultado = await criarGrupo(cod, Gropo_letra, jid_dono);
          log.push({ cod, Gropo_letra, status: 'CRIADO', ...resultado });
        }
      }
    }

    return res.json({ sucesso: true, total: log.length, log });

  } catch (err) {
    console.error('[ERRO]', err);
    return res.status(500).json({ sucesso: false, erro: err.message, log });
  }
}

module.exports = { handleRenomearGrupos, setSock };
