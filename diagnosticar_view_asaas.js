// ============================================================
// diagnosticar_view_asaas.js — V.2607211045
// Diagnóstico da view vw_cob_pend_envio_asaas
//
// Verifica:
// 1. Definição da view
// 2. Cobrança específica ID 49085
// 3. Critérios que podem estar excluindo cobranças
// ============================================================

import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
})

async function diagnosticar() {
  try {
    console.log('🔍 DIAGNÓSTICO DA VIEW vw_cob_pend_envio_asaas\n')

    // 1. Verificar se a view existe
    console.log('1️⃣ Verificando existência da view...')
    const { rows: views } = await pool.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '%cob%envio%asaas%'
    `)
    console.log('Views encontradas:', views)
    console.log()

    // 2. Buscar definição da view
    console.log('2️⃣ Buscando definição da view...')
    const { rows: viewDef } = await pool.query(`
      SELECT pg_get_viewdef('public.vw_cob_pend_envio_asaas', true) as definition
    `)
    if (viewDef[0]) {
      console.log('DEFINIÇÃO DA VIEW:')
      console.log(viewDef[0].definition)
      console.log()
    }

    // 3. Verificar cobrança específica ID 49085
    console.log('3️⃣ Verificando cobrança ID 49085 na tabela Contas_Receber...')
    const { rows: cob } = await pool.query(`
      SELECT "ID",
             "Empresa",
             "Código_Cliente",
             "Documento",
             "Descrição",
             "Data_Conta",
             "Data_Vencimento",
             "Valor",
             "codigo_boleto",
             "CPF_CNPJ_CR",
             "Portador",
             "Centro_Custo"
      FROM public."Contas_Receber"
      WHERE "ID" = 49085
    `)
    console.log('Cobrança encontrada:', cob[0])
    console.log()

    // 4. Verificar dados do cliente 4334
    console.log('4️⃣ Verificando dados do cliente 4334...')
    const { rows: cliente } = await pool.query(`
      SELECT "Codigo",
             "Cliente_Nome",
             "Alerta_Emite_Carta",
             "Plano_Pgto",
             "Cliente_CPF"
      FROM public."Cliente"
      WHERE "Codigo" = 4334
    `)
    console.log('Cliente:', cliente[0])
    console.log()

    // 5. Verificar se aparece na view
    console.log('5️⃣ Verificando se cobrança aparece na view...')
    const { rows: naView } = await pool.query(`
      SELECT "Codigo", "Código_Cliente", "Descrição", "C_vencimento", "C_valor"
      FROM public.vw_cob_pend_envio_asaas
      WHERE "Codigo" = 56842
        AND "Código_Cliente" = 4334
    `)
    console.log('Resultado na view:', naView.length > 0 ? naView[0] : '❌ NÃO APARECE')
    console.log()

    // 6. Testar critérios de filtro da view
    console.log('6️⃣ Testando critérios de filtro da view...')

    if (cob[0] && cliente[0]) {
      const c = cob[0]
      const cli = cliente[0]
      const hoje = new Date().toISOString().split('T')[0]
      const venc = c.Data_Vencimento.toISOString().split('T')[0]
      const planoPgto = cli.Plano_Pgto || 7
      const limiteVenc = new Date()
      limiteVenc.setDate(limiteVenc.getDate() + planoPgto)
      const limiteVencStr = limiteVenc.toISOString().split('T')[0]

      console.log('Checklist da VIEW:')
      console.log(`  ✓ Centro_Custo IN (6,8,9): ${['6','8','9'].includes(c.Centro_Custo) ? '✅ SIM' : '❌ NÃO'} (valor: ${c.Centro_Custo})`)
      console.log(`  ✓ Portador IS NULL: ${c.Portador === null ? '✅ SIM' : '❌ NÃO'}`)
      console.log(`  ✓ Data_Pagamento IS NULL: ${c.Data_Pagamento === null ? '✅ SIM' : '❌ NÃO'}`)
      console.log(`  ✓ Alerta_Emite_Carta = false: ${cli.Alerta_Emite_Carta === false ? '✅ SIM' : '❌ NÃO'} (valor: ${cli.Alerta_Emite_Carta})`)
      console.log(`  ✓ Data_Vencimento >= HOJE: ${venc >= hoje ? '✅ SIM' : '❌ NÃO'} (${venc} >= ${hoje})`)
      console.log(`  ✓ Data_Vencimento <= HOJE+Plano_Pgto: ${venc <= limiteVencStr ? '✅ SIM' : '❌ NÃO'} (${venc} <= ${limiteVencStr}, plano=${planoPgto} dias)`)
      console.log()
      console.log(`  📊 RESULTADO: ${
        ['6','8','9'].includes(c.Centro_Custo) &&
        c.Portador === null &&
        c.Data_Pagamento === null &&
        cli.Alerta_Emite_Carta === false &&
        venc >= hoje &&
        venc <= limiteVencStr
        ? '✅ DEVERIA APARECER NA VIEW'
        : '❌ NÃO PASSA NOS FILTROS DA VIEW'
      }`)
    }
    console.log()

    // 7. Listar outras cobranças pendentes para comparar
    console.log('7️⃣ Listando outras cobranças na VIEW...')
    const { rows: outras } = await pool.query(`
      SELECT "Codigo", "Código_Cliente", "Descrição", "C_vencimento", "C_valor"
      FROM public.vw_cob_pend_envio_asaas
      ORDER BY "C_vencimento"
      LIMIT 10
    `)
    console.log(`Total encontrado na view: ${outras.length}`)
    outras.forEach(o => {
      console.log(`  Cod ${o.Codigo} - Cliente ${o.Código_Cliente} - Venc: ${o.C_vencimento} - R$ ${o.C_valor}`)
    })

  } catch (err) {
    console.error('❌ ERRO:', err.message)
    console.error(err.stack)
  } finally {
    await pool.end()
  }
}

diagnosticar()
