// ============================================================
// verificar_logica_alerta.js — V.2607211110
// Verificar a lógica REAL do campo Alerta_Emite_Carta
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function verificar() {
  try {
    console.log('🔍 VERIFICANDO LÓGICA REAL DO CAMPO Alerta_Emite_Carta\n')

    // 1. Ver se existem cobranças na view e com qual valor de Alerta_Emite_Carta
    console.log('1️⃣ Cobranças que APARECEM na view (com joins para ver Alerta_Emite_Carta):')
    const { rows: naView } = await pool.query(`
      SELECT cr."Codigo",
             cr."Código_Cliente",
             c."Cliente_Nome",
             c."Alerta_Emite_Carta",
             cr."Descrição",
             cr."Data_Vencimento",
             cr."Valor"
      FROM public."Contas_Receber" cr
      JOIN public."Cliente" c ON c."Codigo" = cr."Código_Cliente"
      WHERE cr."Centro_Custo" IN ('6','8','9')
        AND cr."Portador" IS NULL
        AND cr."Data_Pagamento" IS NULL
        AND c."Alerta_Emite_Carta" = false
        AND cr."Data_Vencimento" >= CURRENT_DATE
        AND cr."Data_Vencimento" <= (CURRENT_DATE + COALESCE(c."Plano_Pgto"::integer, 7))
      ORDER BY cr."Data_Vencimento"
      LIMIT 5
    `)

    if (naView.length > 0) {
      console.log(`  ${naView.length} cobrança(s) encontrada(s) com Alerta_Emite_Carta = FALSE`)
      naView.forEach(c => {
        console.log(`    Cliente ${c.Código_Cliente} (Alerta=${c.Alerta_Emite_Carta}) - ${c.Descrição} - R$ ${c.Valor}`)
      })
    } else {
      console.log('  ⚠️ NENHUMA cobrança com Alerta_Emite_Carta = FALSE')
    }
    console.log()

    // 2. Ver cobranças com Alerta_Emite_Carta = TRUE
    console.log('2️⃣ Cobranças que NÃO aparecem (Alerta_Emite_Carta = TRUE):')
    const { rows: bloqueadas } = await pool.query(`
      SELECT cr."Codigo",
             cr."Código_Cliente",
             c."Cliente_Nome",
             c."Alerta_Emite_Carta",
             cr."Descrição",
             cr."Data_Vencimento",
             cr."Valor"
      FROM public."Contas_Receber" cr
      JOIN public."Cliente" c ON c."Codigo" = cr."Código_Cliente"
      WHERE cr."Centro_Custo" IN ('6','8','9')
        AND cr."Portador" IS NULL
        AND cr."Data_Pagamento" IS NULL
        AND c."Alerta_Emite_Carta" = true
        AND cr."Data_Vencimento" >= CURRENT_DATE
        AND cr."Data_Vencimento" <= (CURRENT_DATE + COALESCE(c."Plano_Pgto"::integer, 7))
      ORDER BY cr."Data_Vencimento"
      LIMIT 5
    `)

    if (bloqueadas.length > 0) {
      console.log(`  ${bloqueadas.length} cobrança(s) encontrada(s) com Alerta_Emite_Carta = TRUE`)
      bloqueadas.forEach(c => {
        console.log(`    Cliente ${c.Código_Cliente} (Alerta=${c.Alerta_Emite_Carta}) - ${c.Descrição} - R$ ${c.Valor}`)
      })
    } else {
      console.log('  Nenhuma cobrança com Alerta_Emite_Carta = TRUE')
    }
    console.log()

    // 3. Verificar se já foram enviadas cobranças via Asaas
    console.log('3️⃣ Cobranças que JÁ foram enviadas ao Asaas (codigo_boleto preenchido):')
    const { rows: enviadas } = await pool.query(`
      SELECT cr."Codigo",
             cr."Código_Cliente",
             c."Cliente_Nome",
             c."Alerta_Emite_Carta",
             cr."Descrição",
             cr."codigo_boleto",
             cr."Data_Vencimento"
      FROM public."Contas_Receber" cr
      JOIN public."Cliente" c ON c."Codigo" = cr."Código_Cliente"
      WHERE cr."codigo_boleto" IS NOT NULL
        AND cr."Data_Vencimento" >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY cr."Data_Vencimento" DESC
      LIMIT 10
    `)

    if (enviadas.length > 0) {
      console.log(`  ${enviadas.length} cobrança(s) enviadas nos últimos 30 dias`)
      const porAlerta = enviadas.reduce((acc, c) => {
        const key = c.Alerta_Emite_Carta ? 'TRUE' : 'FALSE'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
      console.log(`    Com Alerta_Emite_Carta = FALSE: ${porAlerta.FALSE || 0}`)
      console.log(`    Com Alerta_Emite_Carta = TRUE: ${porAlerta.TRUE || 0}`)
      console.log()
      console.log('  Exemplos:')
      enviadas.slice(0, 3).forEach(c => {
        console.log(`    Cliente ${c.Código_Cliente} (Alerta=${c.Alerta_Emite_Carta}) - ${c.Descrição}`)
      })
    } else {
      console.log('  ⚠️ Nenhuma cobrança enviada nos últimos 30 dias')
    }
    console.log()

    // 4. CONCLUSÃO
    console.log('📊 CONCLUSÃO:')
    if (naView.length === 0 && bloqueadas.length > 0) {
      console.log('  ⚠️ A VIEW PODE ESTAR COM FILTRO INVERTIDO!')
      console.log('  Existem cobranças com Alerta=TRUE mas nenhuma com Alerta=FALSE')
      console.log('  Sugere que TRUE = enviar, FALSE = não enviar')
    } else if (naView.length > 0 && bloqueadas.length === 0) {
      console.log('  ✓ A view parece estar correta')
      console.log('  FALSE = enviar cobrança')
      console.log('  TRUE = NÃO enviar cobrança')
    } else {
      console.log('  Análise mista - verificar histórico de envios')
    }

  } catch (err) {
    console.error('❌ ERRO:', err.message)
    console.error(err.stack)
  } finally {
    await pool.end()
  }
}

verificar()
