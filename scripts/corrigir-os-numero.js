import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function corrigirOSNumero() {
  try {
    console.log('🔧 Corrigindo OS_Numero dos últimos 90 dias...\n');

    // 1. Ver quantos precisam corrigir
    const preview = await pool.query(`
      SELECT COUNT(*) as total
      FROM "P_BOAT_9_OS"
      WHERE "OS_Dt" > (NOW() - INTERVAL '90 days')
        AND ("OS_Numero" IS NULL OR "OS_Numero" != "Código")
    `);

    const totalCorrigir = parseInt(preview.rows[0].total);

    if (totalCorrigir === 0) {
      console.log('✅ Nenhum registro precisa ser corrigido!');
      return;
    }

    console.log(`📊 Registros a corrigir: ${totalCorrigir}\n`);

    // 2. Listar alguns exemplos ANTES
    console.log('📋 Exemplos ANTES da correção:');
    const exemplosAntes = await pool.query(`
      SELECT "Código", "OS_Numero", "OS_Dt", "Tipo"
      FROM "P_BOAT_9_OS"
      WHERE "OS_Dt" > (NOW() - INTERVAL '90 days')
        AND ("OS_Numero" IS NULL OR "OS_Numero" != "Código")
      ORDER BY "Código" DESC
      LIMIT 10
    `);

    exemplosAntes.rows.forEach(row => {
      console.log(`  Código: ${row.Código} | OS_Numero: ${row.OS_Numero || 'NULL'} | Tipo: ${row.Tipo || '-'}`);
    });

    console.log('\n⏳ Aguardando 3 segundos antes de corrigir...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. CORREÇÃO
    const result = await pool.query(`
      UPDATE "P_BOAT_9_OS"
      SET "OS_Numero" = "Código"
      WHERE "OS_Dt" > (NOW() - INTERVAL '90 days')
        AND ("OS_Numero" IS NULL OR "OS_Numero" != "Código")
    `);

    console.log(`✅ ${result.rowCount} registros corrigidos!\n`);

    // 4. Verificar duplicações restantes nos últimos 90 dias
    console.log('🔍 Verificando duplicações restantes...');
    const duplicados = await pool.query(`
      SELECT 
        "OS_Numero",
        COUNT(*) as qtd,
        STRING_AGG("Código"::text, ', ') as codigos
      FROM "P_BOAT_9_OS"
      WHERE "OS_Dt" > (NOW() - INTERVAL '90 days')
        AND "OS_Numero" IS NOT NULL
      GROUP BY "OS_Numero"
      HAVING COUNT(*) > 1
      ORDER BY "OS_Numero"
      LIMIT 10
    `);

    if (duplicados.rows.length > 0) {
      console.log('\n⚠️  Ainda há duplicações (registros mais antigos):');
      duplicados.rows.forEach(row => {
        console.log(`  OS_Numero: ${row.OS_Numero} → ${row.qtd}x (Códigos: ${row.codigos})`);
      });
    } else {
      console.log('✅ Nenhuma duplicação nos últimos 90 dias!');
    }

    // 5. Listar alguns exemplos DEPOIS
    console.log('\n📋 Exemplos DEPOIS da correção:');
    const exemplosDepois = await pool.query(`
      SELECT "Código", "OS_Numero", "OS_Dt", "Tipo"
      FROM "P_BOAT_9_OS"
      WHERE "OS_Dt" > (NOW() - INTERVAL '90 days')
      ORDER BY "Código" DESC
      LIMIT 10
    `);

    exemplosDepois.rows.forEach(row => {
      const match = row.Código === row.OS_Numero ? '✅' : '❌';
      console.log(`  ${match} Código: ${row.Código} | OS_Numero: ${row.OS_Numero} | Tipo: ${row.Tipo || '-'}`);
    });

    console.log('\n✅ CORREÇÃO CONCLUÍDA!');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

corrigirOSNumero();
