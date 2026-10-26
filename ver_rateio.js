// Ver dados da tabela orcamento_rateio
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('📊 Analisando orcamento_rateio...\n');

try {
  // Exemplo de dados
  const exemplo = await pool.query(`
    SELECT
      r.id_rateio,
      r.id_orcamento,
      r.id_autorizado,
      r.qtd_cotas,
      r.percentual,
      r.valor_cotista,
      r.participando,
      a."Gropo_letra" as grupo_letra,
      c."Cliente_Nome" as nome_pessoa
    FROM orcamento_rateio r
    LEFT JOIN "P_BOAT_4_Autorizados" a ON a."Código" = r.id_autorizado
    LEFT JOIN "Cliente" c ON c."Codigo" = a."Cod_Pessoa"
    WHERE r.id_orcamento = (
      SELECT id_orcamento
      FROM orcamento_rateio
      ORDER BY id_rateio DESC
      LIMIT 1
    )
    ORDER BY a."Gropo_letra", r.id_rateio
  `);

  if (exemplo.rows.length > 0) {
    console.log(`📋 Orçamento ID: ${exemplo.rows[0].id_orcamento}\n`);
    console.log(`Total de linhas: ${exemplo.rows.length}\n`);

    exemplo.rows.forEach((row, i) => {
      console.log(`${(i+1).toString().padStart(2)}. Grupo ${row.grupo_letra || '?'} - ${row.nome_pessoa || 'N/A'}`);
      console.log(`    ${row.percentual}% = R$ ${parseFloat(row.valor_cotista || 0).toFixed(2)}`);
      console.log(`    Participando: ${row.participando ? 'SIM' : 'NÃO'}`);
      console.log('');
    });

    // Análise
    const grupos = {};
    exemplo.rows.forEach(row => {
      const g = row.grupo_letra || '?';
      if (!grupos[g]) {
        grupos[g] = { qtd: 0, valor: 0 };
      }
      grupos[g].qtd++;
      grupos[g].valor += parseFloat(row.valor_cotista || 0);
    });

    console.log('━━━━━━━━━━━━━━━━\n');
    console.log('📊 RESUMO POR GRUPO:\n');
    Object.keys(grupos).sort().forEach(g => {
      console.log(`Grupo ${g}: ${grupos[g].qtd} cotista(s) = R$ ${grupos[g].valor.toFixed(2)}`);
    });
  } else {
    console.log('Nenhum rateio encontrado.\n');
  }

  await pool.end();
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
