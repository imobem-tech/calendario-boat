// ============================================================
// listagem_duplicados_links.js — V.2610261005
// Listagem simples: ID, Cliente, Empresa, Links
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
    console.log('\n');
    console.log('ID CR\tCliente\tEmpresa\tLink Asaas\tObservação');
    console.log('━'.repeat(150));

    for (const id of IDS_DUPLICADOS) {
      const { rows } = await pool.query(`
        SELECT
          cr."ID",
          cr."Codigo",
          cr."Empresa",
          cr."Código_Cliente",
          cr."Descrição",
          cr."Valor",
          cr."Portador",
          cli."Cliente_Nome"
        FROM "Contas_Receber" cr
        LEFT JOIN "Cliente" cli ON cli."Codigo" = cr."Código_Cliente"
        WHERE cr."ID" = $1
      `, [id]);

      if (rows[0]) {
        const r = rows[0];
        const linkAsaas = r.Portador
          ? `https://www.asaas.com/payment/detail/${r.Portador}`
          : 'SEM COBRANÇA';

        const obs = r.Descrição?.includes('Parlela Cota') || r.Descrição?.includes('Parcela Cota')
          ? 'Parcela Cota - RENUMERAR'
          : 'Hora Motor - MANTER';

        console.log(`${r.ID}\t${r.Código_Cliente} - ${r.Cliente_Nome}\t${r.Empresa}\t${linkAsaas}\t${obs}`);
      }
    }

    console.log('━'.repeat(150));
    console.log('\n📋 FORMATO CSV:\n');

    console.log('ID CR;Nome Cliente;Empresa;Link Asaas;Observação');

    for (const id of IDS_DUPLICADOS) {
      const { rows } = await pool.query(`
        SELECT
          cr."ID",
          cr."Codigo",
          cr."Empresa",
          cr."Código_Cliente",
          cr."Descrição",
          cr."Valor",
          cr."Portador",
          cli."Cliente_Nome"
        FROM "Contas_Receber" cr
        LEFT JOIN "Cliente" cli ON cli."Codigo" = cr."Código_Cliente"
        WHERE cr."ID" = $1
      `, [id]);

      if (rows[0]) {
        const r = rows[0];
        const linkAsaas = r.Portador
          ? `https://www.asaas.com/payment/detail/${r.Portador}`
          : 'SEM COBRANÇA';

        const obs = r.Descrição?.includes('Parlela Cota') || r.Descrição?.includes('Parcela Cota')
          ? 'Parcela Cota - RENUMERAR'
          : 'Hora Motor - MANTER';

        console.log(`${r.ID};${r.Código_Cliente} - ${r.Cliente_Nome};${r.Empresa};${linkAsaas};${obs}`);
      }
    }

    console.log('\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
