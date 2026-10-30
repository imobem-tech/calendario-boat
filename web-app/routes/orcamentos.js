// ============================================================
// web-app/routes/orcamentos.js — V.2610301205
// ROTAS WEB DO SISTEMA DE ORÇAMENTOS
//
// 🎯 Usa shared/orcamentos-core.js (fonte única)
// ============================================================

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import {
  gerarMenuPrincipal,
  gerarMenuEmbarcacoes,
  gerarMensagemTitulo,
  gerarMensagemDescricaoItem,
  gerarMensagemValorItem,
  gerarMenuItens,
  gerarResumoFinal,
  validarDescricao,
  validarValor,
  formatarMoeda,
  calcularValores,
  criarNovoOrcamento,
  adicionarItem,
  gerarNumeroOrcamento,
  ESTADOS,
  CONSTANTES,
  QUERIES
} from '../../shared/orcamentos-core.js';

const router = express.Router();

// Pool de conexão
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware de autenticação (reutilizar do sistema)
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Aqui você deve validar o JWT token
  // Por simplicidade, vamos apenas verificar se existe
  if (!token) {
    return res.status(401).json({ erro: 'Token inválido' });
  }

  // TODO: Decodificar e validar JWT
  req.userId = 'web-user'; // Placeholder
  next();
}

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * GET /api/orcamentos/menu
 * Retorna menu principal com contagens
 */
router.get('/menu', autenticar, async (req, res) => {
  try {
    const result = await pool.query(QUERIES.CONTAGENS_MENU);

    const contagens = {
      abertos: parseInt(result.rows[0].abertos) || 0,
      porEmb: parseInt(result.rows[0].por_emb) || 0,
      pendAprov: parseInt(result.rows[0].pend_aprov) || 0,
      pendCobr: parseInt(result.rows[0].pend_cobr) || 0
    };

    const menu = gerarMenuPrincipal(contagens);

    res.json({
      sucesso: true,
      menu: {
        mensagem: menu.mensagem,
        opcoes: menu.opcoes
      },
      contagens
    });
  } catch (error) {
    console.error('❌ [API ORCAMENTOS] Erro ao gerar menu:', error);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/orcamentos/embarcacoes
 * Retorna lista de embarcações ALLMAX
 */
router.get('/embarcacoes', autenticar, async (req, res) => {
  try {
    const result = await pool.query(QUERIES.LISTAR_EMBARCACOES);

    const menu = gerarMenuEmbarcacoes(result.rows);

    res.json({
      sucesso: true,
      embarcacoes: result.rows,
      menu: {
        mensagem: menu.mensagem,
        opcoes: menu.opcoes
      }
    });
  } catch (error) {
    console.error('❌ [API ORCAMENTOS] Erro ao listar embarcações:', error);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * POST /api/orcamentos/validar-titulo
 * Valida título do orçamento
 */
router.post('/validar-titulo', autenticar, async (req, res) => {
  try {
    const { titulo } = req.body;

    const validacao = validarDescricao(titulo);

    res.json({
      sucesso: true,
      valido: validacao.valido,
      mensagem: validacao.mensagemErro
    });
  } catch (error) {
    console.error('❌ [API ORCAMENTOS] Erro ao validar título:', error);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * POST /api/orcamentos/validar-descricao
 * Valida descrição de item
 */
router.post('/validar-descricao', autenticar, async (req, res) => {
  try {
    const { descricao } = req.body;

    const validacao = validarDescricao(descricao);

    res.json({
      sucesso: true,
      valido: validacao.valido,
      mensagem: validacao.mensagemErro
    });
  } catch (error) {
    console.error('❌ [API ORCAMENTOS] Erro ao validar descrição:', error);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * POST /api/orcamentos/validar-valor
 * Valida valor de item
 */
router.post('/validar-valor', autenticar, async (req, res) => {
  try {
    const { valor } = req.body;

    const validacao = validarValor(valor);

    res.json({
      sucesso: true,
      valido: validacao.valido,
      valor: validacao.valor,
      mensagem: validacao.mensagemErro
    });
  } catch (error) {
    console.error('❌ [API ORCAMENTOS] Erro ao validar valor:', error);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * POST /api/orcamentos/criar
 * Cria novo orçamento no banco
 */
router.post('/criar', autenticar, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { embarcacao, titulo, itens } = req.body;

    // Validar dados
    if (!embarcacao || !titulo || !itens || itens.length === 0) {
      throw new Error('Dados incompletos');
    }

    // Calcular valores
    const valores = calcularValores(itens);

    // Gerar número do orçamento
    const numeroOrcamento = gerarNumeroOrcamento();

    // Inserir orçamento
    const orcamentoResult = await client.query(
      QUERIES.INSERIR_ORCAMENTO,
      [
        numeroOrcamento,
        embarcacao.numero_pb,
        titulo,
        valores.subtotal,
        valores.taxa_gestao_percentual,
        valores.taxa_gestao_valor,
        valores.valor_total
      ]
    );

    const idOrcamento = orcamentoResult.rows[0].id_orcamento;

    // Inserir itens
    for (const item of itens) {
      await client.query(
        QUERIES.INSERIR_ITEM,
        [idOrcamento, item.ordem, item.descricao, item.valor || 0]
      );
    }

    await client.query('COMMIT');

    res.json({
      sucesso: true,
      id_orcamento: idOrcamento,
      numero: numeroOrcamento,
      valores
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [API ORCAMENTOS] Erro ao criar orçamento:', error);
    res.status(500).json({ erro: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/orcamentos/listar
 * Lista orçamentos por status
 */
router.get('/listar', autenticar, async (req, res) => {
  try {
    const { status = 'RASCUNHO', limite = 20 } = req.query;

    let whereClause = '';

    if (status === 'RASCUNHO') {
      whereClause = "os.status = 'RASCUNHO' AND os.id_grupo = 1";
    } else if (status === 'FECHADOS') {
      whereClause = "os.status IN ('RECUSADO', 'CONCLUIDO', 'CANCELADO') AND os.id_grupo = 1";
    } else if (status === 'ENVIADO') {
      whereClause = "os.status = 'ENVIADO' AND os.id_grupo = 1";
    } else if (status === 'APROVADO_SEM_COBRANCA') {
      whereClause = "os.status = 'APROVADO' AND os.id_grupo = 1 AND (os.id_cobranca IS NULL OR os.id_cobranca = 0)";
    }

    const result = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_total,
        os.status,
        os.data_orcamento,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao
      FROM "orcamento_servico" os
      JOIN "P_BOAT_1_Embarcacao" e ON e."Num_PB" = os.id_embarcacao
      WHERE ${whereClause}
      ORDER BY os.data_orcamento DESC, os.id_orcamento DESC
      LIMIT $1
    `, [limite]);

    res.json({
      sucesso: true,
      orcamentos: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ [API ORCAMENTOS] Erro ao listar orçamentos:', error);
    res.status(500).json({ erro: error.message });
  }
});

/**
 * GET /api/orcamentos/:id
 * Retorna detalhes de um orçamento específico
 */
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar orçamento
    const orcResult = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao as titulo,
        os.valor_servicos as subtotal,
        os.taxa_servico_perc,
        os.taxa_servico_valor,
        os.valor_total,
        os.status,
        os.data_orcamento,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao
      FROM "orcamento_servico" os
      JOIN "P_BOAT_1_Embarcacao" e ON e."Num_PB" = os.id_embarcacao
      WHERE os.id_orcamento = $1
    `, [id]);

    if (orcResult.rows.length === 0) {
      return res.status(404).json({ erro: 'Orçamento não encontrado' });
    }

    // Buscar itens
    const itensResult = await pool.query(`
      SELECT
        id_item,
        ordem,
        descricao,
        quantidade,
        valor_unitario,
        valor_total as valor
      FROM "orcamento_item"
      WHERE id_orcamento = $1
      ORDER BY ordem
    `, [id]);

    const orcamento = {
      ...orcResult.rows[0],
      itens: itensResult.rows
    };

    res.json({
      sucesso: true,
      orcamento
    });

  } catch (error) {
    console.error('❌ [API ORCAMENTOS] Erro ao buscar orçamento:', error);
    res.status(500).json({ erro: error.message });
  }
});

export default router;
