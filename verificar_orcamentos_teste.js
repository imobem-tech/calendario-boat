import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function verificar() {
  try {
    console.log('📊 ORÇAMENTOS DE TESTE (últimos 10)\n');
    
    const result = await pool.query(`
      SELECT 
        os.id_orcamento,
        os.numero,
        os.status,
        os.valor_total,
        os.id_cobranca,
        os.data_orcamento,
        os.data_aprovacao,
        e."Num_PB" as pb,
        e."Nome_Embar" as embarcacao
      FROM orcamento_servico os
      LEFT JOIN "P_BOAT_1_Embarcacao" e ON e."Num_PB" = os.id_embarcacao
      WHERE os.id_grupo = 1
      ORDER BY os.data_orcamento DESC
      LIMIT 10
    `);
    
    console.log('ID  | Número              | Status      | Cobrança | Valor      | PB  | Embarcação');
    console.log('━'.repeat(100));
    
    result.rows.forEach(orc => {
      const cobranca = orc.id_cobranca ? `✓ ${orc.id_cobranca}` : '✗ Não';
      console.log(
        `${String(orc.id_orcamento).padEnd(4)} | ` +
        `${String(orc.numero).padEnd(20)} | ` +
        `${String(orc.status).padEnd(12)} | ` +
        `${cobranca.padEnd(8)} | ` +
        `R$ ${parseFloat(orc.valor_total).toFixed(2).padEnd(8)} | ` +
        `${String(orc.pb).padEnd(4)} | ` +
        `${orc.embarcacao || 'N/A'}`
      );
    });
    
    console.log('\n🔍 ORÇAMENTOS APROVADOS COM COBRANÇA:\n');
    
    const aprovados = await pool.query(`
      SELECT 
        os.id_orcamento,
        os.numero,
        os.status,
        os.id_cobranca,
        os.valor_total
      FROM orcamento_servico os
      WHERE os.status = 'APROVADO'
        AND os.id_cobranca IS NOT NULL
      ORDER BY os.id_orcamento DESC
      LIMIT 5
    `);
    
    if (aprovados.rows.length > 0) {
      console.log('⚠️  Encontrados orçamentos APROVADOS com cobrança:');
      aprovados.rows.forEach(orc => {
        console.log(`   ID: ${orc.id_orcamento} | ${orc.numero} | Cobrança: ${orc.id_cobranca}`);
      });
      console.log('\n   → Estes DEVERIAM estar CONCLUIDO!\n');
    } else {
      console.log('✅ Nenhum orçamento com problema encontrado\n');
    }
    
    console.log('📝 LOG DOS ÚLTIMOS ORÇAMENTOS:\n');
    
    const logs = await pool.query(`
      SELECT 
        l.id_orcamento,
        os.numero,
        l.tipo_acao,
        l.descricao,
        l.data_acao
      FROM orcamento_log l
      JOIN orcamento_servico os ON os.id_orcamento = l.id_orcamento
      WHERE l.tipo_acao IN ('COBRANCA_ENVIADA', 'APROVADO')
      ORDER BY l.data_acao DESC
      LIMIT 10
    `);
    
    logs.rows.forEach(log => {
      const data = new Date(log.data_acao).toLocaleString('pt-BR');
      console.log(`${log.numero} | ${log.tipo_acao.padEnd(20)} | ${data}`);
      if (log.descricao) console.log(`   → ${log.descricao}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

verificar();
