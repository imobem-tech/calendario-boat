// ============================================================
// reverter_e_corrigir.js — V.2607211120
// Reverte view e corrige cadastro dos 3 clientes
//
// ANÁLISE CORRETA:
// - Alerta_Emite_Carta = FALSE → ENVIAR (1186 clientes, 10 boletos enviados)
// - Alerta_Emite_Carta = TRUE → NÃO ENVIAR (14 clientes, exceção)
//
// SOLUÇÃO: Corrigir cadastro dos 3 clientes de TRUE para FALSE
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function reverterECorrigir() {
  try {
    console.log('🔧 REVERTENDO VIEW E CORRIGINDO CADASTROS\n')

    // 1. Reverter view para o estado original
    console.log('1️⃣ Revertendo view para Alerta_Emite_Carta = false...')
    await pool.query(`
      CREATE OR REPLACE VIEW public.vw_cob_pend_envio_asaas AS
      SELECT
          cr."Boleto_Linha_Digitável",
          cr."Boleto_Conta",
          c."Cliente_ID_tab_6",
          c."Cliente_ID_tab_8",
          c."Cliente_ID_tab_9",
          CASE
              WHEN cr."Centro_Custo"::text = '8'::text THEN c."Cliente_ID_tab_8"
              WHEN cr."Centro_Custo"::text = '9'::text THEN c."Cliente_ID_tab_9"
              ELSE c."Cliente_ID_tab_6"
          END AS "Cliente_Asaas_ID_tab",
          cr."Codigo",
          cr."Centro_Custo",
          c."Outros_Email",
          c."Cliente_Nome",
          cr."Descrição",
          c."Cliente_CPF",
          to_char(cr."Data_Vencimento"::timestamp with time zone, 'YYYY-MM-DD'::text) AS "C_vencimento",
          cr."Valor" AS "C_valor",
          c."Cliente_Telefone_Celular" AS "C_celular",
          cr.agendamento_obs,
          cr."Portador",
          c."Alerta_Emite_Carta" AS "C_mandar_cob",
          cr."Data_Pagamento",
          cr."Data_Conta",
          cr."Código_Cliente"
      FROM "Contas_Receber" cr
      JOIN "Cliente" c ON c."Codigo" = cr."Código_Cliente"
      WHERE cr."Centro_Custo"::text = ANY (ARRAY['6'::character varying, '8'::character varying, '9'::character varying]::text[])
        AND cr."Portador" IS NULL
        AND cr."Data_Pagamento" IS NULL
        AND c."Alerta_Emite_Carta" = false
        AND cr."Data_Vencimento" >= CURRENT_DATE
        AND cr."Data_Vencimento" <= (CURRENT_DATE + COALESCE(c."Plano_Pgto"::integer, 7))
    `)
    console.log('   ✅ View revertida!\n')

    // 2. Mostrar dados dos 3 clientes ANTES da correção
    console.log('2️⃣ Clientes que serão corrigidos:')
    const { rows: antes } = await pool.query(`
      SELECT "Codigo",
             "Cliente_Nome",
             "Alerta_Emite_Carta",
             "Cliente_CPF"
      FROM public."Cliente"
      WHERE "Codigo" IN (4334, 4337, 4345)
      ORDER BY "Codigo"
    `)
    antes.forEach(c => {
      console.log(`   Cliente ${c.Codigo} - ${c.Cliente_Nome}: Alerta_Emite_Carta = ${c.Alerta_Emite_Carta}`)
    })
    console.log()

    // 3. Corrigir os 3 clientes
    console.log('3️⃣ Corrigindo Alerta_Emite_Carta de TRUE para FALSE...')
    const { rowCount } = await pool.query(`
      UPDATE public."Cliente"
      SET "Alerta_Emite_Carta" = false
      WHERE "Codigo" IN (4334, 4337, 4345)
        AND "Alerta_Emite_Carta" = true
    `)
    console.log(`   ✅ ${rowCount} cliente(s) corrigido(s)!\n`)

    // 4. Confirmar correção
    console.log('4️⃣ Verificando após correção:')
    const { rows: depois } = await pool.query(`
      SELECT "Codigo",
             "Cliente_Nome",
             "Alerta_Emite_Carta"
      FROM public."Cliente"
      WHERE "Codigo" IN (4334, 4337, 4345)
      ORDER BY "Codigo"
    `)
    depois.forEach(c => {
      console.log(`   Cliente ${c.Codigo} - ${c.Cliente_Nome}: Alerta_Emite_Carta = ${c.Alerta_Emite_Carta}`)
    })
    console.log()

    // 5. Testar se cobrança 49085 aparece agora
    console.log('5️⃣ Testando se cobrança ID 49085 aparece na view...')
    const { rows: teste } = await pool.query(`
      SELECT "Codigo",
             "Código_Cliente",
             "Cliente_Nome",
             "Descrição",
             "C_vencimento",
             "C_valor"
      FROM public.vw_cob_pend_envio_asaas
      WHERE "Codigo" = 56842
    `)

    if (teste.length > 0) {
      console.log('   ✅ SUCESSO! Cobrança aparece na view:')
      console.log(`      Cod ${teste[0].Codigo} - Cliente ${teste[0].Código_Cliente} - ${teste[0].Descrição} - R$ ${teste[0].C_valor}`)
    } else {
      console.log('   ❌ Cobrança ainda não aparece')
    }
    console.log()

    // 6. Total na view agora
    console.log('6️⃣ Total de cobranças na view:')
    const { rows: total } = await pool.query(`
      SELECT COUNT(*) as total
      FROM public.vw_cob_pend_envio_asaas
    `)
    console.log(`   Total: ${total[0].total} cobrança(s)`)

  } catch (err) {
    console.error('❌ ERRO:', err.message)
    console.error(err.stack)
  } finally {
    await pool.end()
  }
}

reverterECorrigir()
