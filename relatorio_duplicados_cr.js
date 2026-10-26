// ============================================================
// relatorio_duplicados_cr.js — V.2610261000
// Relatório comparativo de registros CR duplicados com links
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const IDS_DUPLICADOS = [50287, 50306, 50288, 50307, 50289, 50308, 50290, 50309];

(async () => {
  try {
    console.log('\n📋 RELATÓRIO COMPARATIVO - REGISTROS CR DUPLICADOS');
    console.log('═'.repeat(150));
    console.log('\n');

    // Buscar dados completos
    const dados = [];

    for (const id of IDS_DUPLICADOS) {
      const { rows } = await pool.query(`
        SELECT
          cr."ID",
          cr."Codigo",
          cr."Empresa",
          cr."Código_Cliente",
          cr."Descrição",
          cr."Valor",
          cr."Data_Vencimento",
          cr."Portador",
          cli."Cliente_Nome"
        FROM "Contas_Receber" cr
        LEFT JOIN "Cliente" cli ON cli."Codigo" = cr."Código_Cliente"
        WHERE cr."ID" = $1
      `, [id]);

      if (rows[0]) {
        dados.push(rows[0]);
      }
    }

    // Agrupar por código duplicado
    const grupos = {};
    dados.forEach(d => {
      if (!grupos[d.Codigo]) grupos[d.Codigo] = [];
      grupos[d.Codigo].push(d);
    });

    // Exibir tabela comparativa
    console.log('┌─────────┬─────────┬────────┬──────────────────────────────────────────┬────────────────────────────┬──────────────────────────────────────────────────────┐');
    console.log('│ ID      │ Código  │ Emp    │ Cliente                                  │ Valor                      │ Payment ID (Link Asaas)                              │');
    console.log('├─────────┼─────────┼────────┼──────────────────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────┤');

    for (const [codigo, registros] of Object.entries(grupos)) {
      // Ordenar por ID
      registros.sort((a, b) => a.ID - b.ID);

      registros.forEach((reg, idx) => {
        const id = String(reg.ID).padEnd(7);
        const cod = String(reg.Codigo).padEnd(7);
        const emp = String(reg.Empresa).padEnd(6);

        const clienteInfo = `${reg.Código_Cliente} - ${reg.Cliente_Nome || 'N/A'}`;
        const cliente = clienteInfo.substring(0, 40).padEnd(40);

        const valor = `R$ ${parseFloat(reg.Valor).toFixed(2)}`.padStart(26);

        const paymentId = reg.Portador || 'N/A';
        const linkAsaas = reg.Portador
          ? `https://www.asaas.com/payment/detail/${reg.Portador}`
          : 'N/A';

        console.log(`│ ${id} │ ${cod} │ ${emp} │ ${cliente} │ ${valor} │ ${paymentId.padEnd(52)} │`);

        if (idx === 0 && registros.length > 1) {
          // Adicionar linha de separação entre duplicados do mesmo código
          console.log('│         │         │        │                                          │                            │                                                      │');
        }
      });

      console.log('├─────────┼─────────┼────────┼──────────────────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────┤');
    }
    console.log('└─────────┴─────────┴────────┴──────────────────────────────────────────┴────────────────────────────┴──────────────────────────────────────────────────────┘');

    console.log('\n\n📊 ANÁLISE DETALHADA POR CÓDIGO:\n');

    for (const [codigo, registros] of Object.entries(grupos)) {
      console.log(`\n${'═'.repeat(150)}`);
      console.log(`CÓDIGO ${codigo} - ${registros.length} REGISTROS`);
      console.log('═'.repeat(150));

      registros.forEach((reg, idx) => {
        console.log(`\n${idx + 1}. ID ${reg.ID} ${idx === 0 ? '(MAIS ANTIGO)' : '(MAIS RECENTE)'}`);
        console.log(`   Cliente: ${reg.Código_Cliente} - ${reg.Cliente_Nome || 'N/A'}`);
        console.log(`   Descrição: ${reg.Descrição}`);
        console.log(`   Valor: R$ ${parseFloat(reg.Valor).toFixed(2)}`);
        console.log(`   Vencimento: ${reg.Data_Vencimento?.toISOString().split('T')[0]}`);
        console.log(`   Payment ID: ${reg.Portador || 'N/A'}`);

        if (reg.Portador) {
          console.log(`   🔗 Link Asaas: https://www.asaas.com/payment/detail/${reg.Portador}`);
        }
      });

      // Comparação
      if (registros.length === 2) {
        console.log(`\n   ⚠️  PROBLEMA:`);
        console.log(`   • Ambos têm o mesmo Payment ID: ${registros[0].Portador}`);
        console.log(`   • Valores diferentes: R$ ${parseFloat(registros[0].Valor).toFixed(2)} vs R$ ${parseFloat(registros[1].Valor).toFixed(2)}`);
        console.log(`   • Clientes diferentes: ${registros[0].Código_Cliente} vs ${registros[1].Código_Cliente}`);

        // Identificar qual parece ser o correto
        const descr0 = registros[0].Descrição?.toLowerCase() || '';
        const descr1 = registros[1].Descrição?.toLowerCase() || '';

        if (descr1.includes('hora_motor') || descr1.includes('hora motor')) {
          console.log(`\n   💡 RECOMENDAÇÃO: Manter ID ${registros[1].ID} (Hora Motor - mais recente)`);
          console.log(`                    Renumerar ID ${registros[0].ID} (Parcela Cota - mais antigo)`);
        }
      }
    }

    console.log('\n\n' + '═'.repeat(150));
    console.log('\n📌 LINKS PARA VERIFICAÇÃO RÁPIDA:\n');

    for (const [codigo, registros] of Object.entries(grupos)) {
      console.log(`\nCÓDIGO ${codigo}:`);
      registros.forEach(reg => {
        if (reg.Portador) {
          console.log(`   ID ${reg.ID}: https://www.asaas.com/payment/detail/${reg.Portador}`);
        }
      });
    }

    console.log('\n\n💡 OBSERVAÇÕES:');
    console.log('   • Todos os registros compartilham o mesmo Payment ID com outro registro');
    console.log('   • Links Asaas podem exigir login no painel Asaas');
    console.log('   • Valor no Asaas corresponde aos registros de Hora Motor (IDs mais recentes)');
    console.log('   • Registros de Parcela Cota (IDs mais antigos) precisam ser renumerados\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
