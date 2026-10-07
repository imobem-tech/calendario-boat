// ============================================================
// GERAR VERSÃO AUTOMÁTICA
// Busca data/hora OFICIAL do sistema
// Formato: V.yyMMddHHmm
// ============================================================

function gerarVersao() {
  const agora = new Date();

  const ano = String(agora.getFullYear()).slice(-2).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  const hora = String(agora.getHours()).padStart(2, '0');
  const minuto = String(agora.getMinutes()).padStart(2, '0');

  const versao = `V.${ano}${mes}${dia}${hora}${minuto}`;

  return {
    versao,
    dataHora: agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    timestamp: agora.getTime()
  };
}

// Executar e mostrar
const resultado = gerarVersao();
console.log('');
console.log('📅 VERSÃO GERADA:');
console.log('='.repeat(50));
console.log(`Versão: ${resultado.versao}`);
console.log(`Data/Hora: ${resultado.dataHora}`);
console.log(`Timestamp: ${resultado.timestamp}`);
console.log('='.repeat(50));
console.log('');

// Exportar para uso em outros scripts
export default gerarVersao;
