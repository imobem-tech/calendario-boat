// ============================================================
// corrigir_ofx_importados_errados.js — V.2609142135
// SCRIPT PARA CORRIGIR REGISTROS OFX IMPORTADOS COM DADOS ERRADOS
//
// PROBLEMA: Importador antigo usava conta hardcoded (6327105)
//           para TODAS as empresas
//
// SOLUÇÃO: Atualizar dados bancários corretos baseado na empresa
// ============================================================

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Dados bancários corretos por empresa
const EMPRESAS_ASAAS = {
  'ALLMAX': {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta_numero: '6327105',
    conta_dv: '0',
    tipo_conta: 'Conta de Pagamento'
  },
  'IMOBEM': {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta_numero: '6576593',
    conta_dv: '5',
    tipo_conta: 'Conta de Pagamento'
  },
  'SUMMER': {
    banco: '461',
    nome_banco: 'Asaas I.P S.A',
    agencia: '0001',
    agencia_dv: null,
    conta_numero: '6327037',
    conta_dv: '5',
    tipo_conta: 'Conta de Pagamento'
  }
};

async function corrigir() {
  try {
    console.log('\n🔧 CORRIGINDO REGISTROS OFX COM DADOS BANCÁRIOS ERRADOS...\n');
    console.log('='.repeat(80));

    // 1. Buscar registros OFX com conta hardcoded
    const registrosErrados = await pool.query(`
      SELECT id, empresa, conta, data, descricao_original
      FROM bank_extratos
      WHERE tipo_importacao = 'OFX'
        AND banco = 'Asaas'
        AND (
          (empresa = 'IMOBEM' AND conta != '6576593')
          OR (empresa = 'SUMMER' AND conta != '6327037')
        )
      ORDER BY empresa, data
    `);

    console.log(`📊 Registros encontrados: ${registrosErrados.rowCount}`);
    console.log('');

    if (registrosErrados.rowCount === 0) {
      console.log('✅ Nenhum registro com dados errados encontrado!');
      await pool.end();
      return;
    }

    // 2. Agrupar por empresa
    const porEmpresa = {};
    registrosErrados.rows.forEach(r => {
      if (!porEmpresa[r.empresa]) {
        porEmpresa[r.empresa] = [];
      }
      porEmpresa[r.empresa].push(r);
    });

    console.log('📋 REGISTROS POR EMPRESA:');
    Object.keys(porEmpresa).forEach(emp => {
      console.log(`   ${emp}: ${porEmpresa[emp].length} registros`);
    });
    console.log('');

    // 3. Corrigir cada empresa
    let totalCorrigidos = 0;

    for (const empresa of Object.keys(porEmpresa)) {
      const dadosCorretos = EMPRESAS_ASAAS[empresa];

      if (!dadosCorretos) {
        console.log(`⚠️  Empresa ${empresa}: Dados bancários não encontrados (pulando)`);
        continue;
      }

      console.log(`\n🔧 Corrigindo ${empresa}:`);
      console.log(`   Conta correta: ${dadosCorretos.conta_numero}-${dadosCorretos.conta_dv}`);

      const result = await pool.query(`
        UPDATE bank_extratos
        SET codigo_banco = $1,
            nome_banco = $2,
            agencia = $3,
            agencia_dv = $4,
            conta = $5,
            conta_dv = $6,
            tipo_conta = $7
        WHERE tipo_importacao = 'OFX'
          AND banco = 'Asaas'
          AND empresa = $8
          AND conta != $5
        RETURNING id, data, descricao_original
      `, [
        dadosCorretos.banco,
        dadosCorretos.nome_banco,
        dadosCorretos.agencia,
        dadosCorretos.agencia_dv,
        dadosCorretos.conta_numero,
        dadosCorretos.conta_dv,
        dadosCorretos.tipo_conta,
        empresa
      ]);

      console.log(`   ✅ Atualizados: ${result.rowCount} registros`);

      if (result.rows.length > 0 && result.rows.length <= 5) {
        result.rows.forEach(r => {
          console.log(`      - ID ${r.id}: ${r.data} - ${r.descricao_original.substring(0, 40)}`);
        });
      }

      totalCorrigidos += result.rowCount;
    }

    console.log('');
    console.log('='.repeat(80));
    console.log(`✅ CONCLUÍDO! Total corrigido: ${totalCorrigidos} registros`);
    console.log('');

    await pool.end();
  } catch (err) {
    console.error('❌ Erro:', err);
    await pool.end();
    process.exit(1);
  }
}

corrigir();
