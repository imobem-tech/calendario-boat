// ============================================================
// analisar_alerta_emite_carta.js — V.2607211102
// Analisa o campo Alerta_Emite_Carta e sua distribuição
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function analisar() {
  try {
    console.log('🔍 ANÁLISE DO CAMPO Alerta_Emite_Carta\n')

    // 1. Distribuição geral
    console.log('1️⃣ Distribuição geral:')
    const { rows: dist } = await pool.query(`
      SELECT "Alerta_Emite_Carta",
             COUNT(*) as total
      FROM public."Cliente"
      GROUP BY "Alerta_Emite_Carta"
      ORDER BY total DESC
    `)
    dist.forEach(d => {
      console.log(`  ${d.Alerta_Emite_Carta === true ? 'TRUE' : d.Alerta_Emite_Carta === false ? 'FALSE' : 'NULL'}: ${d.total} clientes`)
    })
    console.log()

    // 2. Clientes com cobrança pendente mas com Alerta_Emite_Carta = true
    console.log('2️⃣ Clientes com cobrança pendente mas Alerta_Emite_Carta = TRUE:')
    const { rows: bloqueados } = await pool.query(`
      SELECT DISTINCT c."Codigo",
             c."Cliente_Nome",
             c."Alerta_Emite_Carta",
             COUNT(cr."ID") as qtd_cobrancas
      FROM public."Cliente" c
      JOIN public."Contas_Receber" cr ON cr."Código_Cliente" = c."Codigo"
      WHERE c."Alerta_Emite_Carta" = true
        AND cr."Data_Pagamento" IS NULL
        AND cr."Portador" IS NULL
        AND cr."Data_Vencimento" >= CURRENT_DATE
        AND cr."Centro_Custo" IN ('6','8','9')
      GROUP BY c."Codigo", c."Cliente_Nome", c."Alerta_Emite_Carta"
      ORDER BY qtd_cobrancas DESC
      LIMIT 10
    `)

    if (bloqueados.length > 0) {
      console.log(`  Total: ${bloqueados.length} clientes com cobranças bloqueadas`)
      bloqueados.forEach(b => {
        console.log(`    Cliente ${b.Codigo} - ${b.Cliente_Nome}: ${b.qtd_cobrancas} cobrança(s)`)
      })
    } else {
      console.log('  Nenhum cliente bloqueado encontrado')
    }
    console.log()

    // 3. Cliente específico 4334
    console.log('3️⃣ Cliente 4334 (PATRICK SWAYZE):')
    const { rows: cli4334 } = await pool.query(`
      SELECT "Codigo",
             "Cliente_Nome",
             "Alerta_Emite_Carta",
             "Cliente_CPF",
             "Outros_Email",
             "Cliente_Telefone_Celular"
      FROM public."Cliente"
      WHERE "Codigo" = 4334
    `)
    console.log(JSON.stringify(cli4334[0], null, 2))
    console.log()

    // 4. Cobranças do cliente 4334
    console.log('4️⃣ Cobranças pendentes do cliente 4334:')
    const { rows: cobs } = await pool.query(`
      SELECT "ID",
             "Codigo",
             "Descrição",
             "Data_Vencimento",
             "Valor",
             "Data_Pagamento"
      FROM public."Contas_Receber"
      WHERE "Código_Cliente" = 4334
        AND "Data_Pagamento" IS NULL
        AND "Data_Vencimento" >= CURRENT_DATE
      ORDER BY "Data_Vencimento"
    `)

    console.log(`  Total: ${cobs.length} cobrança(s) pendente(s)`)
    cobs.forEach(c => {
      console.log(`    ID ${c.ID} - ${c.Descrição} - Venc: ${c.Data_Vencimento.toISOString().split('T')[0]} - R$ ${c.Valor}`)
    })

  } catch (err) {
    console.error('❌ ERRO:', err.message)
  } finally {
    await pool.end()
  }
}

analisar()
