// ============================================================
// ASAAS WEBHOOK INTERATIVO
// V.2609140047
//
// NOVO (13/09 22:36):
// - Removida primeira mensagem (desnecessária)
// - Mensagem de classificação com hora/minutos
// - Nome do cliente com emoji 🙋
// - Texto final: "digite o número da categoria"
//
// NOVO (14/09 00:47):
// - Removido código morto (funções antigas não usadas)
// - Removido uso de bank_regras_classificacao
//
// FUNCIONALIDADES:
// 1. Quando webhook chegar → Perguntar no grupo o que é
// 2. Tratar resposta com lançamentos padrão
// 3. Se similar → aceitar
// 4. Se diferente → questionar
// 5. Salvar documento (se tiver imagem)
// ============================================================

import pkg from 'pg';
const { Pool } = pkg;

import { GRUPOS_FINANCEIROS } from '../../config/grupos-financeiros.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Perguntar no grupo sobre lançamento do Asaas
 * Agora inicia automaticamente o fluxo de classificação
 */
export async function perguntarSobreLancamentoAsaas(sock, empresa, lancamento) {
  try {
    // Buscar grupo da empresa
    const grupoId = GRUPOS_FINANCEIROS[empresa];

    if (!grupoId) {
      console.log(`⚠️ Grupo financeiro não configurado para ${empresa}`);
      return;
    }

    // 1) REMOVIDO: Primeira mensagem desnecessária (já vai direto para classificação)

    // 2) Buscar lançamento completo do banco
    const lancCompleto = await pool.query(`
      SELECT
        id,
        data,
        valor,
        descricao_original,
        tipo,
        empresa,
        nome_origem,
        cpf_cnpj_origem
      FROM bank_extratos
      WHERE id = $1
    `, [lancamento.id]);

    if (lancCompleto.rows.length === 0) {
      console.log(`⚠️ Lançamento ${lancamento.id} não encontrado no banco`);
      return;
    }

    const lanc = lancCompleto.rows[0];

    // 3) Determinar tipo e buscar categorias
    const tipoLancamento = lanc.valor > 0 ? 'CREDITO' : 'DEBITO';
    const categorias = await pool.query(`
      SELECT id, nome, tipo, icone
      FROM bank_categorias
      WHERE empresa IN ('TODAS', $1)
        AND ativo = true
        AND tipo = $2
      ORDER BY nome
    `, [empresa, tipoLancamento]);

    if (categorias.rows.length === 0) {
      await sock.sendMessage(grupoId, {
        text: `⚠️ Nenhuma categoria ${tipoLancamento} encontrada para ${empresa}`
      });
      return;
    }

    // 4) Enviar lista de categorias
    await enviarListaCategoriasAsaas(sock, grupoId, lanc, categorias.rows);

    // 5) Iniciar estado (importar do comando-pendentes)
    const { iniciarClassificacaoAsaas } = await import('./comando-pendentes.js');
    await iniciarClassificacaoAsaas(grupoId, lanc, categorias.rows, empresa);

    console.log(`📱 Notificação e categorias enviadas para grupo ${empresa}`);

  } catch (err) {
    console.error('❌ Erro ao perguntar no grupo:', err);
  }
}

/**
 * Enviar lista de categorias para classificação Asaas
 */
async function enviarListaCategoriasAsaas(sock, grupoId, lancamento, categorias) {
  const valorFormatado = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Math.abs(lancamento.valor));

  // Data com hora e minutos (formato: 13/09/2026 22:30)
  const dataObj = new Date(lancamento.data);
  const agora = new Date();
  const dataComHora = `${dataObj.toLocaleDateString('pt-BR')} ${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;

  let mensagem = `\n📝 *CLASSIFICANDO LANÇAMENTO*\n\n`;
  mensagem += `💰 ${valorFormatado} - ${lancamento.valor > 0 ? 'Recebido' : 'Pago'}\n`;
  mensagem += `📅 ${dataComHora}\n`;
  mensagem += `🏢 ${lancamento.empresa || 'N/A'}\n`;
  mensagem += `📝 ${lancamento.descricao_original}\n`;

  // Adicionar nome da pessoa se existir
  if (lancamento.nome_origem) {
    mensagem += `🙋 ${lancamento.nome_origem}\n`;
  }

  mensagem += `\n${'━'.repeat(16)}\n`;
  mensagem += `📂 *CATEGORIAS DISPONÍVEIS:*\n\n`;

  categorias.forEach((cat, i) => {
    const numero = i + 1;
    const emoji = cat.icone || '📁';
    mensagem += `${numero} ${emoji} ${cat.nome}\n`;
  });

  mensagem += `\n${'━'.repeat(16)}\n`;
  mensagem += `✏️ digite o número da categoria`;

  await sock.sendMessage(grupoId, { text: mensagem });
}

// ============================================================
// CÓDIGO REMOVIDO (14/09/2026 00:47)
//
// Funções antigas que usavam bank_regras_classificacao:
// - processarRespostaWebhook()
// - processarRespostaTexto()
// - buscarLancamentosSimilares()
// - calcularSimilaridade()
// - classificarComoPadrao()
// - classificarComoNovo()
//
// MOTIVO: Não eram mais usadas (código morto)
// SUBSTITUÍDO POR: Sistema novo com palavras_chave + chave_aprendida
//                   nas categorias (classificacao-automatica.js)
// ============================================================

// ============================================================
// FIM — V.2609122245
// Funções exportadas diretamente nas linhas 30 e 81
// ============================================================
