// ============================================================
// API ORÇAMENTOS - SUMMERMAX
// V.2606210825
// ============================================================
//
// RELACIONAMENTOS:
// - P_BOAT_1_Embarcacao.Num_PB = P_BOAT_4_Autorizados.Cod_Embarcacao
// - P_BOAT_4_Autorizados.Cod_Pessoa = Cliente.Código
// - P_BOAT_1_Embarcacao.Cod_Cliente = Cliente.Código (proprietário)
//
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================================================
// GET /api/orcamentos/embarcacoes
// Lista todas embarcações ativas
// ============================================================
export async function listarEmbarcacoes(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        e."Código" as id,
        e."Num_PB" as numero_pb,
        e."Nome_Embarcação" as nome,
        e."Marca" as marca,
        e."Modelo" as modelo,
        e."Pés" as pes,
        e."Ano" as ano,
        c."Cliente_Nome" as proprietario,
        CASE
          WHEN e."Cod_Cliente" = 4255 THEN TRUE
          ELSE FALSE
        END as is_allmax
      FROM "P_BOAT_1_Embarcacao" e
      LEFT JOIN "Cliente" c ON e."Cod_Cliente" = c."Código"
      WHERE e."Ativo" = TRUE
      ORDER BY e."Num_PB"
      LIMIT 200
    `);

    res.json({
      success: true,
      total: result.rows.length,
      embarcacoes: result.rows
    });

  } catch (error) {
    console.error('❌ Erro ao listar embarcações:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar embarcações',
      message: error.message
    });
  }
}

// ============================================================
// GET /api/orcamentos/embarcacao/:num_pb/cotistas
// Busca cotistas de uma embarcação
// CORRIGIDO: Usa Num_PB para relacionamento
// ============================================================
export async function buscarCotistas(req, res) {
  try {
    const { num_pb } = req.params;

    console.log(`🔍 Buscando cotistas da embarcação Num_PB: ${num_pb}`);

    // ✅ RELACIONAMENTO CORRETO
    const result = await pool.query(`
      SELECT
        a."Código" as id,
        a."Cod_Pessoa" as id_cliente,
        a."Cod_Embarcacao" as num_pb,
        a."Cota_comp" as qtd_cotas,
        c."Código" as codigo_cliente,
        c."Cliente_Nome" as nome,
        c."Cliente_CPF" as cpf_cnpj,
        c."Cliente_Telefone_Celular" as telefone,
        c."Cliente_Email" as email
      FROM "P_BOAT_4_Autorizados" a
      LEFT JOIN "Cliente" c ON a."Cod_Pessoa" = c."Código"
      WHERE a."Cod_Embarcacao" = $1
        AND a."Cota_comp" > 0
      ORDER BY a."Código"
    `, [num_pb]);

    console.log(`✅ Encontrados ${result.rows.length} cotistas`);

    res.json({
      success: true,
      total: result.rows.length,
      cotistas: result.rows
    });

  } catch (error) {
    console.error('❌ Erro ao buscar cotistas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar cotistas',
      message: error.message
    });
  }
}

// ============================================================
// GET /api/orcamentos/embarcacao/:num_pb/completa
// Busca embarcação completa com cotistas
// ============================================================
export async function buscarEmbarcacaoCompleta(req, res) {
  try {
    const { num_pb } = req.params;

    // 1. Buscar dados da embarcação
    const embarcacaoResult = await pool.query(`
      SELECT
        e."Código" as id,
        e."Num_PB" as numero_pb,
        e."Nome_Embarcação" as nome,
        e."Marca" as marca,
        e."Modelo" as modelo,
        e."Ano" as ano,
        e."Pés" as pes,
        e."Cod_Cliente" as id_proprietario,
        c."Código" as codigo_proprietario,
        c."Cliente_Nome" as nome_proprietario,
        c."Cliente_CPF" as cpf_proprietario,
        c."Cliente_Telefone_Celular" as telefone_proprietario,
        CASE
          WHEN e."Cod_Cliente" = 4255 THEN TRUE
          ELSE FALSE
        END as is_allmax
      FROM "P_BOAT_1_Embarcacao" e
      LEFT JOIN "Cliente" c ON e."Cod_Cliente" = c."Código"
      WHERE e."Num_PB" = $1
    `, [num_pb]);

    if (embarcacaoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Embarcação não encontrada'
      });
    }

    const embarcacao = embarcacaoResult.rows[0];

    // 2. Buscar cotistas
    const cotistasResult = await pool.query(`
      SELECT
        a."Código" as id,
        a."Cod_Pessoa" as id_cliente,
        a."Cota_comp" as qtd_cotas,
        c."Cliente_Nome" as nome,
        c."Cliente_CPF" as cpf_cnpj,
        c."Cliente_Telefone_Celular" as telefone
      FROM "P_BOAT_4_Autorizados" a
      LEFT JOIN "Cliente" c ON a."Cod_Pessoa" = c."Código"
      WHERE a."Cod_Embarcacao" = $1
        AND a."Cota_comp" > 0
      ORDER BY a."Código"
    `, [num_pb]);

    // 3. Retornar objeto completo
    res.json({
      success: true,
      embarcacao: {
        ...embarcacao,
        total_cotistas: cotistasResult.rows.length,
        cotistas: cotistasResult.rows
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar embarcação completa:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar embarcação',
      message: error.message
    });
  }
}

// ============================================================
// GET /api/orcamentos
// Lista todos orçamentos
// ============================================================
export async function listarOrcamentos(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        o."id_orcamento",
        o."id_embarcacao",
        o."descricao",
        o."valor_total",
        o."status",
        o."criado",
        e."Num_PB" as numero_pb,
        e."Nome_Embarcação" as nome_embarcacao
      FROM "orcamento_servico" o
      LEFT JOIN "P_BOAT_1_Embarcacao" e ON o."id_embarcacao" = e."Num_PB"
      WHERE o."id_grupo" = 1
      ORDER BY o."criado" DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      total: result.rows.length,
      orcamentos: result.rows
    });

  } catch (error) {
    console.error('❌ Erro ao listar orçamentos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar orçamentos',
      message: error.message
    });
  }
}

// ============================================================
// POST /api/orcamentos
// Cria orçamento com rateio automático
// ============================================================
export async function criarOrcamento(req, res) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      id_embarcacao,  // Num_PB da embarcação
      descricao,
      valor_total,
      observacao,
      ratear_cotistas = false
    } = req.body;

    console.log(`📝 Criando orçamento para embarcação ${id_embarcacao}`);

    // 1. Criar orçamento principal
    const orcamentoResult = await client.query(`
      INSERT INTO "orcamento_servico" (
        "id_embarcacao",
        "descricao",
        "valor_total",
        "observacao",
        "status",
        "id_grupo",
        "criado"
      ) VALUES ($1, $2, $3, $4, 'PENDENTE', 1, NOW())
      RETURNING "id_orcamento"
    `, [id_embarcacao, descricao, valor_total, observacao]);

    const id_orcamento = orcamentoResult.rows[0].id_orcamento;

    console.log(`✅ Orçamento criado: ${id_orcamento}`);

    // 2. Ratear entre cotistas (se solicitado)
    if (ratear_cotistas) {
      const cotistasResult = await client.query(`
        SELECT
          a."Cod_Pessoa" as id_cliente,
          a."Cota_comp" as qtd_cotas,
          c."Cliente_Nome" as nome
        FROM "P_BOAT_4_Autorizados" a
        LEFT JOIN "Cliente" c ON a."Cod_Pessoa" = c."Código"
        WHERE a."Cod_Embarcacao" = $1
          AND a."Cota_comp" > 0
      `, [id_embarcacao]);

      const cotistas = cotistasResult.rows;
      const total_cotas = cotistas.reduce((sum, c) => sum + parseFloat(c.qtd_cotas), 0);

      console.log(`📊 Rateando entre ${cotistas.length} cotistas (${total_cotas} cotas)`);

      for (const cotista of cotistas) {
        const percentual = (parseFloat(cotista.qtd_cotas) / total_cotas) * 100;
        const valor_rateado = (valor_total * percentual) / 100;

        await client.query(`
          INSERT INTO "orcamento_rateio" (
            "id_orcamento",
            "id_cotista",
            "qtd_cotas",
            "percentual",
            "valor",
            "criado"
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [id_orcamento, cotista.id_cliente, cotista.qtd_cotas, percentual, valor_rateado]);

        console.log(`  ✓ ${cotista.nome}: ${percentual.toFixed(2)}% = R$ ${valor_rateado.toFixed(2)}`);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Orçamento criado com sucesso',
      id_orcamento,
      rateio_criado: ratear_cotistas
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar orçamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar orçamento',
      message: error.message
    });
  } finally {
    client.release();
  }
}

// V.2606210825
