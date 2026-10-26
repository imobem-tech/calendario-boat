// Script para atualizar funções de log no arquivo orcamentos.js
import fs from 'fs';

const arquivo = 'wpp/comandos/orcamentos.js';

// Ler arquivo
let conteudo = fs.readFileSync(arquivo, 'utf8');

// Novas funções
const novasFuncoes = `async function adicionarLog(idOrcamento, acao, descricao, usuario) {
  try {
    const telefone = usuario.replace('@s.whatsapp.net', '').replace(/\\D/g, '');

    await pool.query(\`
      INSERT INTO "orcamento_log" (
        "id_orcamento",
        "acao",
        "descricao",
        "data_hora",
        "ip_origem"
      ) VALUES ($1, $2, $3, NOW() AT TIME ZONE 'America/Sao_Paulo', $4)
    \`, [idOrcamento, acao, descricao, telefone]);

    console.log(\`📝 [LOG] Orçamento #\${idOrcamento}: \${acao}\`);
  } catch (error) {
    console.error('❌ [LOG] Erro ao adicionar log:', error);
  }
}

/**
 * Busca e formata todos os logs de um orçamento
 * @param {number} idOrcamento - ID do orçamento
 * @returns {string} - Logs formatados
 */
async function buscarLogs(idOrcamento) {
  try {
    const result = await pool.query(\`
      SELECT
        data_hora,
        acao,
        descricao,
        ip_origem as usuario
      FROM "orcamento_log"
      WHERE id_orcamento = $1
      ORDER BY data_hora DESC
    \`, [idOrcamento]);

    if (result.rows.length === 0) {
      return '(nenhum registro de log)';
    }

    let logs = '';
    result.rows.forEach(log => {
      const data = new Date(log.data_hora);
      const dataFormatada = \`\${data.getFullYear()}/\${String(data.getMonth() + 1).padStart(2, '0')}/\${String(data.getDate()).padStart(2, '0')}-\${String(data.getHours()).padStart(2, '0')}:\${String(data.getMinutes()).padStart(2, '0')}\`;

      logs += \`━━━━━━━━━━━━━━━━
\${dataFormatada}
\${log.descricao || log.acao}
USR: \${log.usuario || '(sistema)'}
\`;
    });

    logs += \`━━━━━━━━━━━━━━━━\`;

    return logs;
  } catch (error) {
    console.error('❌ [LOG] Erro ao buscar logs:', error);
    return '(erro ao carregar logs)';
  }
}`;

// Encontrar e substituir as funções antigas
const inicioAdicionar = conteudo.indexOf('async function adicionarLog(idOrcamento, mensagem, usuario)');
const fimAdicionar = conteudo.indexOf('}\n\n/**', inicioAdicionar) + 1;

const inicioBuscar = conteudo.indexOf('async function buscarLogs(idOrcamento)', fimAdicionar);
const fimBuscar = conteudo.indexOf('\n}\n\n// ============================================================\n// CONSULTAR ORÇAMENTOS', inicioBuscar) + 2;

if (inicioAdicionar === -1 || inicioBuscar === -1) {
  console.log('❌ Não encontrou as funções antigas!');
  process.exit(1);
}

// Substituir
const parte1 = conteudo.substring(0, inicioAdicionar);
const parte2 = conteudo.substring(fimBuscar);

const novoConteudo = parte1 + novasFuncoes + parte2;

// Salvar
fs.writeFileSync(arquivo, novoConteudo, 'utf8');

console.log('✅ Funções de log atualizadas com sucesso!');
console.log(`   Arquivo: ${arquivo}`);
