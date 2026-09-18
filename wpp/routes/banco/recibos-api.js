// ============================================================
// wpp/routes/banco/recibos-api.js — V.2609181930
// API PARA ACESSAR RECIBOS SALVOS NO VERCEL BLOB
// Migrado de filesystem (Railway ephemeral) para Vercel Blob (permanente)
// NOVO (18/09 19:30): Rota POST /upload para adicionar anexos via web
// NOVO (14/09 01:05): Endpoint /categorias/todas adicionado
// ============================================================

import express from 'express';
import multer from 'multer';
import { put } from '@vercel/blob';
import pkg from 'pg';
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Configurar multer para upload em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

/**
 * GET /api/banco/recibos/listar?empresa=IMOBEM
 * Lista todos os recibos (opcionalmente filtrado por empresa)
 * Busca do banco de dados (campo recibos_urls)
 */
router.get('/listar', async (req, res) => {
  try {
    const { empresa } = req.query;

    let query = `
      SELECT
        id,
        empresa,
        data,
        valor,
        descricao_original,
        classificacao,
        recibos_urls
      FROM bank_extratos
      WHERE recibos_urls IS NOT NULL
        AND recibos_urls::TEXT != '[]'
    `;

    const params = [];

    if (empresa) {
      query += ` AND empresa = $1`;
      params.push(empresa);
    }

    query += ` ORDER BY data DESC`;

    const result = await pool.query(query, params);

    // Transformar resultado para formato esperado pela interface
    const arquivos = [];

    for (const row of result.rows) {
      const recibos = row.recibos_urls || [];

      for (const recibo of recibos) {
        // Parse do nome: 001_123456_20260912_022021.jpg
        const match = recibo.nome.match(/^(\d{3})_(\d+)_(\d{8}_\d{6})\.(.*)$/);

        if (match) {
          const [, categoriaId, lancamentoId, timestamp, ext] = match;

          arquivos.push({
            empresa: row.empresa,
            categoriaId: parseInt(categoriaId),
            lancamentoId: parseInt(lancamentoId),
            timestamp: timestamp,
            arquivo: recibo.nome,
            tamanho: recibo.tamanho || 0,
            tipo: recibo.tipo || ext,
            url: recibo.url, // URL direta do Vercel Blob
            data: row.data,
            valor: row.valor,
            descricao: row.descricao_original,
            classificacao: row.classificacao
          });
        }
      }
    }

    res.json({
      total: arquivos.length,
      arquivos: arquivos
    });

  } catch (err) {
    console.error('❌ Erro ao listar recibos:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/recibos/empresas
 * Lista empresas que têm recibos
 */
router.get('/empresas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        empresa,
        COUNT(*) FILTER (WHERE recibos_urls IS NOT NULL AND recibos_urls::TEXT != '[]') as total_recibos
      FROM bank_extratos
      WHERE recibos_urls IS NOT NULL AND recibos_urls::TEXT != '[]'
      GROUP BY empresa
      ORDER BY empresa
    `);

    const empresas = result.rows.map(row => ({
      empresa: row.empresa,
      totalRecibos: parseInt(row.total_recibos),
      url: `/api/banco/recibos/listar?empresa=${row.empresa}`
    }));

    res.json({ empresas });

  } catch (err) {
    console.error('❌ Erro ao listar empresas:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/recibos/download/:empresa/:arquivo
 * Redireciona para URL do Vercel Blob
 * (Mantido por compatibilidade, mas agora apenas redireciona)
 */
router.get('/download/:empresa/:arquivo', async (req, res) => {
  try {
    const { empresa, arquivo } = req.params;

    // Buscar URL do Vercel Blob no banco
    const result = await pool.query(`
      SELECT recibos_urls
      FROM bank_extratos
      WHERE empresa = $1
        AND recibos_urls @> $2::jsonb
    `, [empresa, JSON.stringify([{ nome: arquivo }])]);

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Arquivo não encontrado' });
    }

    const recibos = result.rows[0].recibos_urls;
    const recibo = recibos.find(r => r.nome === arquivo);

    if (!recibo) {
      return res.status(404).json({ erro: 'Arquivo não encontrado' });
    }

    // Redirecionar para URL do Vercel Blob
    res.redirect(recibo.url);

  } catch (err) {
    console.error('❌ Erro ao baixar recibo:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/banco/recibos/categorias/todas
 * Lista todas as categorias disponíveis
 */
router.get('/categorias/todas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        nome,
        tipo,
        icone
      FROM bank_categorias
      WHERE ativo = true
      ORDER BY tipo, nome
    `);

    res.json({
      total: result.rows.length,
      categorias: result.rows
    });

  } catch (err) {
    console.error('❌ Erro ao listar categorias:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * POST /api/banco/recibos/upload
 * Upload de anexos via web (extrato bancário)
 */
router.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    const { empresa, data_lancamento, lancamento_id } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
    }

    if (!lancamento_id) {
      return res.status(400).json({ sucesso: false, erro: 'lancamento_id é obrigatório' });
    }

    console.log(`📎 Upload de ${files.length} arquivo(s) para lançamento ${lancamento_id}`);

    const urlsUpload = [];

    // Upload de cada arquivo para Vercel Blob
    for (const file of files) {
      const timestamp = Date.now();
      const nomeArquivo = `${lancamento_id}_${timestamp}_${file.originalname.replace(/\s+/g, '_')}`;
      const blobPath = `recibos/${empresa}/${nomeArquivo}`;

      console.log(`   Enviando: ${file.originalname} (${(file.size/1024).toFixed(2)} KB)`);

      const blob = await put(blobPath, file.buffer, {
        access: 'public',
        addRandomSuffix: false
      });

      urlsUpload.push(blob.url);
      console.log(`   ✅ Upload concluído: ${blob.url}`);
    }

    // Atualizar banco de dados
    const result = await pool.query(`
      SELECT recibos_urls FROM bank_extratos WHERE id = $1
    `, [lancamento_id]);

    let recibosAtuais = [];
    if (result.rows.length > 0 && result.rows[0].recibos_urls) {
      recibosAtuais = result.rows[0].recibos_urls;
    }

    const novosRecibos = [...recibosAtuais, ...urlsUpload];

    await pool.query(`
      UPDATE bank_extratos
      SET recibos_urls = $1
      WHERE id = $2
    `, [JSON.stringify(novosRecibos), lancamento_id]);

    console.log(`✅ ${files.length} anexo(s) adicionado(s) ao lançamento ${lancamento_id}`);

    res.json({
      sucesso: true,
      quantidade: files.length,
      urls: urlsUpload
    });

  } catch (err) {
    console.error('❌ Erro ao fazer upload:', err);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
