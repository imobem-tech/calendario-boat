// V.261001141500
// Script para verificar extratos bancários relacionados à cliente 3202
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

async function consultarContas() {
  try {
    // Estatísticas gerais
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_registros,
        COUNT(DISTINCT cliente_id) as total_clientes,
        COUNT(CASE WHEN classificacao IS NULL THEN 1 END) as sem_classificacao,
        COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendentes,
        MIN(data) as data_min,
        MAX(data) as data_max
      FROM bank_extratos
    `);

    console.log('=== ESTATÍSTICAS GERAIS bank_extratos ===');
    console.log(`Total de registros: ${stats.rows[0].total_registros}`);
    console.log(`Total de clientes únicos: ${stats.rows[0].total_clientes}`);
    console.log(`Sem classificação: ${stats.rows[0].sem_classificacao}`);
    console.log(`Status PENDENTE: ${stats.rows[0].pendentes}`);
    console.log(`Data mais antiga: ${stats.rows[0].data_min}`);
    console.log(`Data mais recente: ${stats.rows[0].data_max}\n`);

    // Buscar registros que contenham 3202
    const busca = await pool.query(`
      SELECT
        id,
        data,
        descricao_original,
        documento,
        valor,
        tipo,
        cliente_id,
        classificacao,
        status
      FROM bank_extratos
      WHERE (descricao_original ILIKE '%3202%'
         OR nome_origem ILIKE '%3202%'
         OR nome_destino ILIKE '%3202%'
         OR documento ILIKE '%3202%')
        AND data < '2026-09-01'
        AND (classificacao IS NULL OR status = 'PENDENTE')
      ORDER BY data
      LIMIT 100
    `);

    console.log('=== EXTRATOS COM "3202" (antes de 01/09/2026) ===');
    console.log(`Total encontrado: ${busca.rows.length}\n`);

    if (busca.rows.length > 0) {
      busca.rows.forEach((item, index) => {
        console.log(`${index + 1}. Data: ${item.data} | Valor: R$ ${parseFloat(item.valor).toFixed(2)}`);
        console.log(`   Descrição: ${item.descricao_original}`);
        console.log(`   Cliente ID: ${item.cliente_id || 'NULL'} | Status: ${item.status || 'NULL'}`);
        console.log(`   Classificação: ${item.classificacao || 'SEM CLASSIFICAÇÃO'}\n`);
      });

      // Agrupar
      const grupos = {};
      busca.rows.forEach(item => {
        const texto = item.descricao_original || 'SEM DESCRIÇÃO';
        const descBase = texto.replace(/\d{2}\/\d{2}\/\d{4}/g, 'DATA')
                              .replace(/\d{2}\/\d{2}/g, 'DATA')
                              .replace(/\b\d+\b/g, 'NUM');

        if (!grupos[descBase]) {
          grupos[descBase] = {
            quantidade: 0,
            valor_total: 0,
            exemplo: texto
          };
        }

        grupos[descBase].quantidade++;
        grupos[descBase].valor_total += parseFloat(item.valor);
      });

      console.log('\n=== AGRUPAMENTO POR TIPO ===\n');
      Object.entries(grupos).forEach(([tipo, dados]) => {
        console.log(`${dados.exemplo}`);
        console.log(`  Quantidade: ${dados.quantidade} | Total: R$ ${dados.valor_total.toFixed(2)}\n`);
      });
    }

    await pool.end();
  } catch (error) {
    console.error('Erro ao consultar:', error);
    await pool.end();
    process.exit(1);
  }
}

consultarContas();
