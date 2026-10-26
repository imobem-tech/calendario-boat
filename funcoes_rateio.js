// ============================================================
// FUNÇÕES DE RATEIO - Para adicionar em orcamentos.js
// Versão: V.2610241422
// ============================================================

// ============================================================
// SISTEMA DE RATEIO
// ============================================================

/**
 * Busca todos os cotistas da embarcação
 */
async function buscarCotistas(idEmbarcacao) {
  try {
    const result = await pool.query(`
      SELECT
        "Código" as id_autorizado,
        "Gropo_letra" as grupo_letra,
        "Cod_Pessoa" as cod_pessoa
      FROM "P_BOAT_4_Autorizados"
      WHERE "Cod_Embarcacao" = $1
        AND "Dt_Desautorizacao" IS NULL
      ORDER BY "Gropo_letra"
    `, [idEmbarcacao]);

    return result.rows.map(cot => {
      // Extrair número de cotas (ex: F1 → 1, W2 → 2, K11 → 11)
      const match = cot.grupo_letra.match(/(\d+)/);
      const qtdCotas = match ? parseInt(match[1]) : 1;

      return {
        id_autorizado: cot.id_autorizado,
        grupo_letra: cot.grupo_letra,
        cod_pessoa: cot.cod_pessoa,
        qtd_cotas: qtdCotas,
        percentual: qtdCotas * 6.25
      };
    });
  } catch (error) {
    console.error('❌ [RATEIO] Erro ao buscar cotistas:', error);
    throw error;
  }
}

/**
 * Calcula rateio sugerido (divisão proporcional)
 */
function calcularRateioSugerido(cotistas, orcamento) {
  const totalCotas = cotistas.reduce((sum, c) => sum + c.qtd_cotas, 0);
  const valorTotal = parseFloat(orcamento.valor_total);
  const subtotal = parseFloat(orcamento.subtotal);
  const taxaTotal = parseFloat(orcamento.taxa_servico_valor);

  return cotistas.map(cotista => {
    const percentual = cotista.percentual;
    const valorCotista = valorTotal * (percentual / 100);
    const valorServico = subtotal * (percentual / 100);
    const valorTaxa = taxaTotal * (percentual / 100);

    return {
      ...cotista,
      total_cotas: totalCotas,
      valor_servico: valorServico,
      valor_taxa: valorTaxa,
      valor_cotista: valorCotista
    };
  });
}

/**
 * Busca rateio existente
 */
async function buscarRateioExistente(idOrcamento) {
  try {
    const result = await pool.query(`
      SELECT
        r.*,
        a."Gropo_letra" as grupo_letra
      FROM orcamento_rateio r
      JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
      WHERE r.id_orcamento = $1
      ORDER BY a."Gropo_letra"
    `, [idOrcamento]);

    return result.rows;
  } catch (error) {
    console.error('❌ [RATEIO] Erro ao buscar rateio:', error);
    return [];
  }
}

/**
 * Mostra menu de rateio com sugestão inicial
 */
async function mostrarMenuRateio(sock, userId, groupId, estado) {
  try {
    const { orcamento } = estado;

    // Buscar cotistas da embarcação
    const cotistas = await buscarCotistas(orcamento.id_embarcacao);

    if (cotistas.length === 0) {
      await sock.sendMessage(groupId, {
        text: '❌ Nenhum cotista encontrado para esta embarcação!'
      });
      return;
    }

    // Verificar se já tem rateio
    const rateioExistente = await buscarRateioExistente(orcamento.id_orcamento);

    if (rateioExistente.length > 0) {
      // Mostrar rateio existente
      let mensagem = `━━━━━━━━━━━━━━━━
📊 *RATEIO ATUAL*
━━━━━━━━━━━━━━━━
🆔 Orçamento: #${orcamento.id_orcamento}
💰 Total: ${formatarMoeda(orcamento.valor_total)}
━━━━━━━━━━━━━━━━
*DISTRIBUIÇÃO:*\n`;

      rateioExistente.forEach(r => {
        mensagem += `\n${r.grupo_letra} (${r.qtd_cotas} cotas/${r.percentual}%)
  ${formatarMoeda(r.valor_cotista)}`;
      });

      mensagem += `\n━━━━━━━━━━━━━━━━
*OPÇÕES:*
1️⃣ Redistribuir
0️⃣ Voltar
━━━━━━━━━━━━━━━━
Digite a opção:`;

      await sock.sendMessage(groupId, { text: mensagem });

      atualizarEstado(userId, {
        ...estado,
        etapa: 'RATEIO_EXISTENTE',
        cotistas,
        rateio_atual: rateioExistente
      });

    } else {
      // Calcular sugestão
      const rateioSugerido = calcularRateioSugerido(cotistas, {
        valor_total: orcamento.valor_total,
        subtotal: orcamento.subtotal,
        taxa_servico_valor: orcamento.taxa_servico_valor
      });

      let mensagem = `━━━━━━━━━━━━━━━━
📊 *DEFINIR RATEIO*
━━━━━━━━━━━━━━━━
🆔 Orçamento: #${orcamento.id_orcamento}
💰 Total: ${formatarMoeda(orcamento.valor_total)}
━━━━━━━━━━━━━━━━
*SUGESTÃO (divisão proporcional):*\n`;

      rateioSugerido.forEach(r => {
        mensagem += `\n${r.grupo_letra} (${r.qtd_cotas} cotas/${r.percentual.toFixed(2)}%)
  ${formatarMoeda(r.valor_cotista)}`;
      });

      mensagem += `\n━━━━━━━━━━━━━━━━
*OPÇÕES:*
1️⃣ Confirmar sugestão
2️⃣ Ajustar manualmente
0️⃣ Voltar
━━━━━━━━━━━━━━━━
Digite a opção:`;

      await sock.sendMessage(groupId, { text: mensagem });

      atualizarEstado(userId, {
        ...estado,
        etapa: 'RATEIO_MENU',
        cotistas,
        rateio_sugerido: rateioSugerido,
        rateio_manual: []
      });
    }

  } catch (error) {
    console.error('❌ [RATEIO] Erro ao mostrar menu:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao carregar rateio.\\n\\n${error.message}`
    });
  }
}

/**
 * Salva rateio no banco
 */
async function salvarRateio(sock, userId, groupId, estado, rateio) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { orcamento } = estado;

    // Apagar rateio anterior se existir
    await client.query(`
      DELETE FROM orcamento_rateio
      WHERE id_orcamento = $1
    `, [orcamento.id_orcamento]);

    // Inserir novo rateio
    for (const item of rateio) {
      await client.query(`
        INSERT INTO orcamento_rateio (
          id_orcamento,
          id_cliente,
          id_autorizado,
          qtd_cotas,
          total_cotas,
          percentual,
          valor_servico,
          valor_taxa,
          valor_cotista,
          participando
        ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, true)
      `, [
        orcamento.id_orcamento,
        item.id_autorizado,
        item.qtd_cotas,
        item.total_cotas,
        item.percentual,
        item.valor_servico,
        item.valor_taxa,
        item.valor_cotista
      ]);
    }

    // Log
    await adicionarLog(
      orcamento.id_orcamento,
      'RATEIO_DEFINIDO',
      `Rateio definido para ${rateio.length} cotista(s)`,
      userId
    );

    await client.query('COMMIT');

    await sock.sendMessage(groupId, {
      text: `✅ *RATEIO SALVO!*
━━━━━━━━━━━━━━━━
${rateio.length} cotista(s) definido(s)

O orçamento já pode ser aprovado!

Digite *menu* para voltar.`
    });

    limparEstado(userId);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [RATEIO] Erro ao salvar:', error);
    await sock.sendMessage(groupId, {
      text: `❌ Erro ao salvar rateio.\\n\\n${error.message}`
    });
  } finally {
    client.release();
  }
}

/**
 * Mostra lista de cotistas para seleção manual
 */
async function mostrarListaCotistas(sock, userId, groupId, estado) {
  const { cotistas, rateio_manual } = estado;
  const { orcamento } = estado;

  const valorTotal = parseFloat(orcamento.valor_total);
  const valorJaDistribuido = rateio_manual.reduce((sum, r) => sum + r.valor_cotista, 0);
  const valorRestante = valorTotal - valorJaDistribuido;
  const percentualRestante = (valorRestante / valorTotal) * 100;

  let mensagem = `━━━━━━━━━━━━━━━━
📊 *RATEIO MANUAL*
━━━━━━━━━━━━━━━━
💰 Total: ${formatarMoeda(valorTotal)}
✅ Distribuído: ${formatarMoeda(valorJaDistribuido)} (${(100 - percentualRestante).toFixed(2)}%)
⏳ Restante: ${formatarMoeda(valorRestante)} (${percentualRestante.toFixed(2)}%)
━━━━━━━━━━━━━━━━
*SELECIONE COTISTA:*\n`;

  cotistas.forEach((c, index) => {
    const jaDefinido = rateio_manual.find(r => r.id_autorizado === c.id_autorizado);
    if (!jaDefinido) {
      mensagem += `\n${index + 1}️⃣ ${c.grupo_letra} (${c.qtd_cotas} cotas/${c.percentual.toFixed(2)}%)`;
    }
  });

  mensagem += `\n━━━━━━━━━━━━━━━━
Digite o número do cotista:

0️⃣ Cancelar
━━━━━━━━━━━━━━━━`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'RATEIO_SELECIONAR_COTISTA'
  });
}

/**
 * Pede valor para o cotista selecionado
 */
async function pedirValorCotista(sock, userId, groupId, estado, cotistaSelecionado) {
  const { orcamento, rateio_manual } = estado;

  const valorTotal = parseFloat(orcamento.valor_total);
  const valorJaDistribuido = rateio_manual.reduce((sum, r) => sum + r.valor_cotista, 0);
  const valorRestante = valorTotal - valorJaDistribuido;

  const mensagem = `━━━━━━━━━━━━━━━━
📊 *DEFINIR VALOR*
━━━━━━━━━━━━━━━━
👤 Cotista: ${cotistaSelecionado.grupo_letra}
💰 Valor restante: ${formatarMoeda(valorRestante)}

Digite o valor para este cotista:

Formatos aceitos:
• 100
• 100,50
• 1.000,50

0️⃣ Cancelar
━━━━━━━━━━━━━━━━`;

  await sock.sendMessage(groupId, { text: mensagem });

  atualizarEstado(userId, {
    ...estado,
    etapa: 'RATEIO_DEFINIR_VALOR',
    cotista_selecionado: cotistaSelecionado
  });
}

// Exportar para adicionar ao orcamentos.js
// (copiar todas as funções acima para dentro do arquivo orcamentos.js)
