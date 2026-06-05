// V.2606051520
// Consultar proprietário do PB 576 no banco

import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require"
});

async function consultar() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL\n');

    // Verificar nome correto da tabela
    console.log('🔍 PROCURANDO TABELAS DE EMBARCAÇÕES...\n');

    const tabelas = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name ILIKE '%embarca%' OR table_name ILIKE '%boat%')
      ORDER BY table_name
    `);

    console.log('📋 Tabelas encontradas:');
    tabelas.rows.forEach(row => console.log('  -', row.table_name));
    console.log('');

    // Primeiro descobrir colunas da tabela
    console.log('🔍 Descobrindo estrutura da tabela P_BOAT_1_Embarcacao...\n');

    const colunas = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'P_BOAT_1_Embarcacao'
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    console.log('📋 Colunas da tabela:');
    colunas.rows.forEach(row => console.log(`  - ${row.column_name} (${row.data_type})`));
    console.log('');

    // Agora consultar PB 576
    const tabelasPossiveis = [
      '"P_BOAT_1_Embarcacao"'
    ];

    for (const tabela of tabelasPossiveis) {
      try {
        console.log(`🔍 Consultando PB 576 em ${tabela}...\n`);

        const result = await client.query(`
          SELECT *
          FROM ${tabela}
          WHERE "Num_PB" = 576
          LIMIT 1
        `);

        if (result.rows.length > 0) {
          console.log(`✅ ENCONTRADO na tabela: ${tabela}\n`);
          console.log('📊 DADOS DO PB 576:');
          console.log('─────────────────────────────');

          const dados = result.rows[0];

          // Mostrar campos relevantes
          if (dados.Cod_Proprietario) console.log('Cod_Proprietario:', dados.Cod_Proprietario);
          if (dados['Cod_Proprietário']) console.log('Cod_Proprietário:', dados['Cod_Proprietário']);
          if (dados.Cod_Cliente) console.log('Cod_Cliente:', dados.Cod_Cliente);
          if (dados.Cod_Emb_PB) console.log('Cod_Emb_PB:', dados.Cod_Emb_PB);
          if (dados.Num_PB) console.log('Num_PB:', dados.Num_PB);

          console.log('\n📋 TODOS OS CAMPOS:');
          console.log(JSON.stringify(dados, null, 2));

          break;
        } else {
          console.log(`⚠️ PB 576 não encontrado na tabela ${tabela}\n`);
        }
      } catch (err) {
        console.log(`❌ Tabela ${tabela} não existe ou erro: ${err.message}\n`);
      }
    }

    // Consultar também outros PBs para comparação
    console.log('\n🔍 CONSULTANDO OUTROS PBs PARA COMPARAÇÃO:\n');

    const pbs = [573, 565, 605, 576];

    for (const pb of pbs) {
      try {
        const result = await client.query(`
          SELECT "Cod_Emb_PB", "Cod_Cliente"
          FROM "P_BOAT_1_Embarcacao"
          WHERE "Num_PB" = $1
          LIMIT 1
        `, [pb]);

        if (result.rows.length > 0) {
          const codCliente = result.rows[0].Cod_Cliente;
          const tipo = codCliente === 4255 ? 'ALLMAX' : 'SUMMER';
          console.log(`PB ${pb}: Cod_Cliente = ${codCliente} → ${tipo}`);
        } else {
          console.log(`PB ${pb}: ❌ Não encontrado`);
        }
      } catch (err) {
        console.log(`PB ${pb}: Erro - ${err.message}`);
      }
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await client.end();
    console.log('\n✅ Conexão fechada');
  }
}

consultar();
