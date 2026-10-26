// ============================================================
// api/orcamentos/visualizar/[token]/index.js — V.2610260819
// GET /api/orcamentos/visualizar/:token
// Visualiza orçamento por token de segurança
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  // Só aceita GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Método não permitido'
    });
  }

  try {
    const { token } = req.query;

    console.log(`👁️ Visualizando orçamento com token: ${token}`);

    // 1. Buscar orçamento pelo token
    const orcResult = await pool.query(`
      SELECT
        os.id_orcamento,
        os.numero,
        os.descricao,
        os.observacao,
        os.status,
        os.valor_servicos,
        os.taxa_servico_perc,
        os.taxa_servico_valor,
        os.valor_total,
        os.data_orcamento,
        os.data_aprovacao,
        os.token_visualizacao,
        os.id_embarcacao,
        e."Num_PB" as numero_pb,
        e."Nome_Embar" as nome_embarcacao
      FROM orcamento_servico os
      LEFT JOIN "P_BOAT_1_Embarcacao" e ON e."Num_PB" = os.id_embarcacao
      WHERE os.token_visualizacao = $1
    `, [token]);

    if (orcResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orçamento não encontrado ou token inválido'
      });
    }

    const orcamento = orcResult.rows[0];

    // 2. Buscar itens do orçamento
    const itensResult = await pool.query(`
      SELECT
        ordem,
        descricao,
        valor_total
      FROM orcamento_item
      WHERE id_orcamento = $1
      ORDER BY ordem
    `, [orcamento.id_orcamento]);

    // 3. Buscar rateio
    const rateioResult = await pool.query(`
      SELECT
        r.qtd_cotas,
        r.percentual,
        r.valor_cotista,
        a."Gropo_letra" as grupo_letra,
        c."Cliente_Nome" as nome_pessoa
      FROM orcamento_rateio r
      LEFT JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      LEFT JOIN "Cliente" c ON c."Codigo" = a."Cod_Pessoa"
      WHERE r.id_orcamento = $1
      ORDER BY a."Gropo_letra"
    `, [orcamento.id_orcamento]);

    res.status(200).json({
      success: true,
      orcamento: {
        ...orcamento,
        itens: itensResult.rows,
        rateio: rateioResult.rows
      }
    });

  } catch (error) {
    console.error('❌ Erro ao visualizar orçamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao visualizar orçamento',
      message: error.message
    });
  }
}

// ============================================================
// FIM — V.2610242101
// ============================================================
