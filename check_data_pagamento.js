// ============================================================
// check_data_pagamento.js — V.2607211058
// Verificar campo Data_Pagamento da cobrança ID 49085
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function verificar() {
  try {
    console.log('🔍 Verificando Data_Pagamento da cobrança ID 49085\n')

    const { rows } = await pool.query(`
      SELECT "ID",
             "Codigo",
             "Código_Cliente",
             "Descrição",
             "Data_Vencimento",
             "Data_Pagamento" IS NULL as "pagamento_is_null",
             length("Data_Pagamento"::text) as "tamanho_texto",
             "Portador" IS NULL as "portador_is_null",
             "Centro_Custo"
      FROM public."Contas_Receber"
      WHERE "ID" = 49085
    `)

    if (rows[0]) {
      console.log('📋 DADOS DA COBRANÇA:')
      console.log(JSON.stringify(rows[0], null, 2))
      console.log()

      console.log('🔎 ANÁLISE:')
      console.log(`  Data_Pagamento IS NULL? ${rows[0].pagamento_is_null}`)
      console.log(`  Tamanho do texto: ${rows[0].tamanho_texto}`)
      console.log(`  Portador IS NULL? ${rows[0].portador_is_null}`)
      console.log()

      if (!rows[0].pagamento_is_null && rows[0].tamanho_texto === 0) {
        console.log('⚠️ PROBLEMA: Data_Pagamento contém STRING VAZIA em vez de NULL!')
        console.log('   Isso impede a cobrança de aparecer na view.')
      }
    }

  } catch (err) {
    console.error('❌ ERRO:', err.message)
  } finally {
    await pool.end()
  }
}

verificar()
