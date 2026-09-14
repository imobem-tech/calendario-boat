// ============================================================
// debug-classificacao-api.js — V.2609142035
// ENDPOINT DE DEBUG PARA TESTAR CLASSIFICAÇÃO EM PRODUÇÃO
// ============================================================

import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';
import { classificarLancamento } from './classificacao-automatica.js';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/banco/debug-classificacao
router.get('/', async (req, res) => {
  try {
    const logs = [];

    logs.push('='.repeat(80));
    logs.push('🐛 DEBUG: CLASSIFICAÇÃO EM PRODUÇÃO');
    logs.push('='.repeat(80));
    logs.push('');

    // 1. Verificar conexão do pool
    logs.push('1️⃣ TESTAR CONEXÃO DO POOL:');
    try {
      const testConn = await pool.query('SELECT NOW()');
      logs.push(`   ✅ Pool conectado: ${testConn.rows[0].now}`);
    } catch (err) {
      logs.push(`   ❌ Erro no pool: ${err.message}`);
      return res.json({ sucesso: false, logs });
    }
    logs.push('');

    // 2. Buscar categorias com "taxa"
    logs.push('2️⃣ CATEGORIAS COM "TAXA":');
    const cats = await pool.query(`
      SELECT id, nome, empresa, ativo, palavras_chave
      FROM bank_categorias
      WHERE ativo = true
        AND LOWER(palavras_chave) LIKE '%taxa%'
      ORDER BY id
    `);

    if (cats.rows.length === 0) {
      logs.push('   ❌ NENHUMA CATEGORIA ENCONTRADA!');
    } else {
      cats.rows.forEach(c => {
        logs.push(`   ✅ ID ${c.id}: ${c.nome} (${c.empresa || 'TODAS'})`);
        logs.push(`      Palavras: ${c.palavras_chave}`);
      });
    }
    logs.push('');

    // 3. Buscar um registro não classificado
    logs.push('3️⃣ BUSCAR REGISTRO NÃO CLASSIFICADO:');
    const reg = await pool.query(`
      SELECT id, empresa, descricao_original, valor, tipo, classificacao
      FROM bank_extratos
      WHERE descricao_original LIKE '%Taxa de mensageria%'
        AND (classificacao IS NULL OR classificacao = '')
        AND empresa = 'ALLMAX'
      LIMIT 1
    `);

    if (reg.rows.length === 0) {
      logs.push('   ❌ Nenhum registro encontrado com "Taxa de mensageria"');
      return res.json({ sucesso: false, logs });
    }

    const registro = reg.rows[0];
    logs.push(`   ✅ Encontrado: ID ${registro.id}`);
    logs.push(`      Descrição: ${registro.descricao_original}`);
    logs.push(`      Valor: R$ ${registro.valor}`);
    logs.push('');

    // 4. Testar classificação
    logs.push('4️⃣ TESTAR CLASSIFICAÇÃO:');
    logs.push(`   Chamando classificarLancamento()...`);

    try {
      const resultado = await classificarLancamento({
        description: registro.descricao_original,
        value: Math.abs(registro.valor),
        tipo: registro.tipo,
        empresa: registro.empresa,
        cpfCnpjOrigem: null
      });

      if (resultado && resultado.categoria_id) {
        logs.push(`   ✅ CLASSIFICOU!`);
        logs.push(`      Categoria: ${resultado.categoria_nome}`);
        logs.push(`      Método: ${resultado.metodo}`);
      } else {
        logs.push(`   ❌ NÃO CLASSIFICOU!`);
        logs.push(`      Resultado: ${JSON.stringify(resultado)}`);
      }
    } catch (err) {
      logs.push(`   ❌ ERRO na classificação: ${err.message}`);
      logs.push(`      Stack: ${err.stack}`);
    }

    logs.push('');
    logs.push('='.repeat(80));

    res.json({
      sucesso: true,
      logs,
      registro: {
        id: registro.id,
        descricao: registro.descricao_original,
        valor: registro.valor
      }
    });

  } catch (err) {
    res.status(500).json({
      sucesso: false,
      erro: err.message,
      stack: err.stack
    });
  }
});

export default router;
