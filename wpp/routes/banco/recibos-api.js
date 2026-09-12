// ============================================================
// wpp/routes/banco/recibos-api.js — V.260912030000
// API PARA ACESSAR RECIBOS SALVOS NO RAILWAY
// ============================================================

import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const BASE_DIR = path.join(process.cwd(), 'doc_financeiros');

/**
 * GET /api/recibos/listar?empresa=IMOBEM
 * Lista todos os recibos (opcionalmente filtrado por empresa)
 */
router.get('/listar', (req, res) => {
  try {
    const { empresa } = req.query;

    if (!fs.existsSync(BASE_DIR)) {
      return res.json({
        mensagem: 'Nenhum recibo encontrado (pasta não existe)',
        arquivos: []
      });
    }

    const arquivos = [];

    // Função recursiva para listar arquivos
    function listarRecursivo(dir, empresaAtual = '', categoria = '') {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Se está na raiz, é empresa
          if (!empresaAtual) {
            listarRecursivo(fullPath, item, '');
          }
          // Se tem empresa, é categoria
          else if (!categoria) {
            listarRecursivo(fullPath, empresaAtual, item);
          }
        } else {
          // É arquivo
          arquivos.push({
            empresa: empresaAtual,
            categoria: categoria,
            arquivo: item,
            tamanho: stat.size,
            data: stat.mtime,
            url: `/api/recibos/download/${empresaAtual}/${encodeURIComponent(categoria)}/${encodeURIComponent(item)}`
          });
        }
      }
    }

    // Listar de empresa específica ou todas
    if (empresa) {
      const empresaDir = path.join(BASE_DIR, empresa);
      if (fs.existsSync(empresaDir)) {
        listarRecursivo(empresaDir, empresa, '');
      }
    } else {
      listarRecursivo(BASE_DIR);
    }

    res.json({
      total: arquivos.length,
      arquivos: arquivos.sort((a, b) => b.data - a.data) // Mais recentes primeiro
    });

  } catch (err) {
    console.error('❌ Erro ao listar recibos:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/recibos/download/:empresa/:categoria/:arquivo
 * Baixa um recibo específico
 */
router.get('/download/:empresa/:categoria/:arquivo', (req, res) => {
  try {
    const { empresa, categoria, arquivo } = req.params;

    const filePath = path.join(BASE_DIR, empresa, categoria, arquivo);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo não encontrado' });
    }

    // Detectar tipo de arquivo
    const ext = path.extname(arquivo).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf',
      '.bin': 'application/octet-stream'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Enviar arquivo
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${arquivo}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (err) {
    console.error('❌ Erro ao baixar recibo:', err);
    res.status(500).json({ erro: err.message });
  }
});

/**
 * GET /api/recibos/empresas
 * Lista empresas que têm recibos
 */
router.get('/empresas', (req, res) => {
  try {
    if (!fs.existsSync(BASE_DIR)) {
      return res.json({ empresas: [] });
    }

    const empresas = fs.readdirSync(BASE_DIR)
      .filter(item => {
        const stat = fs.statSync(path.join(BASE_DIR, item));
        return stat.isDirectory();
      })
      .map(empresa => {
        const empresaPath = path.join(BASE_DIR, empresa);
        let totalArquivos = 0;

        // Contar arquivos recursivamente
        function contarArquivos(dir) {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              contarArquivos(fullPath);
            } else {
              totalArquivos++;
            }
          }
        }

        contarArquivos(empresaPath);

        return {
          empresa,
          totalRecibos: totalArquivos,
          url: `/api/recibos/listar?empresa=${empresa}`
        };
      });

    res.json({ empresas });

  } catch (err) {
    console.error('❌ Erro ao listar empresas:', err);
    res.status(500).json({ erro: err.message });
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
