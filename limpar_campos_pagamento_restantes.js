// ============================================================
// limpar_campos_pagamento_restantes.js — V.2610261105
// Limpa Data_Pagamento e Total dos 4 CRs do Felipe
// ============================================================

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const IDS_FELIPE = [50287, 50288, 50289, 50290];

(async () => {
  try {
    console.log('\n🧹 LIMPEZA DE CAMPOS DE PAGAMENTO RESTANTES\n');
    console.log('═'.repeat(80));

    // 1. Verificar dados ANTES
    console.log('\n📋 DADOS ANTES DA LIMPEZA:\n');

    for (const id of IDS_FELIPE) {
      const { rows } = await pool.query(`
        SELECT "ID", "Codigo", "Data_Pagamento", "Total"
        FROM "Contas_Receber"
        WHERE "ID" = $1
      `, [id]);

      if (rows[0]) {
        const cr = rows[0];
        console.log(`ID ${cr.ID} | Código ${cr.Codigo}`);
        console.log(`   Data_Pagamento: ${cr.Data_Pagamento || 'NULL'}`);
        console.log(`   Total: ${cr.Total !== null && cr.Total !== undefined ? cr.Total : 'NULL'}`);
      }
    }

    // 2. Limpar campos
    console.log('\n\n🚀 LIMPANDO CAMPOS...\n');

    for (const id of IDS_FELIPE) {
      await pool.query(`
        UPDATE "Contas_Receber"
        SET
          "Data_Pagamento" = NULL,
          "Total" = NULL
        WHERE "ID" = $1
      `, [id]);

      console.log(`   ✅ ID ${id}: Data_Pagamento e Total limpos`);
    }

    // 3. Verificar dados DEPOIS
    console.log('\n\n✅ VERIFICAÇÃO FINAL:\n');

    for (const id of IDS_FELIPE) {
      const { rows } = await pool.query(`
        SELECT "ID", "Codigo", "Data_Pagamento", "Total"
        FROM "Contas_Receber"
        WHERE "ID" = $1
      `, [id]);

      if (rows[0]) {
        const cr = rows[0];
        console.log(`ID ${cr.ID} | Código ${cr.Codigo}`);
        console.log(`   Data_Pagamento: ${cr.Data_Pagamento || 'NULL ✅'}`);
        console.log(`   Total: ${cr.Total !== null && cr.Total !== undefined ? cr.Total : 'NULL ✅'}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ LIMPEZA CONCLUÍDA!\n');
    console.log('📋 Campos limpos:');
    console.log('   • Portador');
    console.log('   • agendamento_obs');
    console.log('   • Boleto_Linha_Digitável');
    console.log('   • Data_Pagamento ✅');
    console.log('   • Total ✅\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
})();
