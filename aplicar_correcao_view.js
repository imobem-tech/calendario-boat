// ============================================================
// aplicar_correcao_view.js — V.2607211116
// Aplica a correção da view e testa o resultado
// ============================================================

import pkg from 'pg'
import { readFileSync } from 'fs'
const { Pool } = pkg

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function aplicarCorrecao() {
  try {
    console.log('🔧 APLICANDO CORREÇÃO DA VIEW vw_cob_pend_envio_asaas\n')

    // 1. Ler SQL
    const sql = readFileSync('corrigir_view_asaas.sql', 'utf8')

    // 2. Aplicar
    console.log('1️⃣ Aplicando CREATE OR REPLACE VIEW...')
    await pool.query(sql)
    console.log('   ✅ View corrigida com sucesso!\n')

    // 3. Verificar se agora aparece a cobrança
    console.log('2️⃣ Verificando se cobrança ID 49085 aparece agora...')
    const { rows: teste } = await pool.query(`
      SELECT "Codigo",
             "Código_Cliente",
             "Cliente_Nome",
             "Descrição",
             "C_vencimento",
             "C_valor"
      FROM public.vw_cob_pend_envio_asaas
      WHERE "Codigo" = 56842
        AND "Código_Cliente" = 4334
    `)

    if (teste.length > 0) {
      console.log('   ✅ SUCESSO! Cobrança agora aparece na view:')
      console.log(JSON.stringify(teste[0], null, 2))
    } else {
      console.log('   ❌ Cobrança ainda não aparece')
    }
    console.log()

    // 4. Listar todas cobranças pendentes agora
    console.log('3️⃣ Total de cobranças na view agora:')
    const { rows: todas } = await pool.query(`
      SELECT COUNT(*) as total
      FROM public.vw_cob_pend_envio_asaas
    `)
    console.log(`   Total: ${todas[0].total} cobrança(s)\n`)

    // 5. Mostrar as 5 primeiras
    console.log('4️⃣ Primeiras 5 cobranças:')
    const { rows: primeiras } = await pool.query(`
      SELECT "Codigo",
             "Código_Cliente",
             "Cliente_Nome",
             "C_vencimento",
             "C_valor"
      FROM public.vw_cob_pend_envio_asaas
      ORDER BY "C_vencimento"
      LIMIT 5
    `)
    primeiras.forEach(c => {
      console.log(`   Cod ${c.Codigo} - Cliente ${c.Código_Cliente} (${c.Cliente_Nome}) - Venc: ${c.C_vencimento} - R$ ${c.C_valor}`)
    })

  } catch (err) {
    console.error('❌ ERRO:', err.message)
    console.error(err.stack)
  } finally {
    await pool.end()
  }
}

aplicarCorrecao()
