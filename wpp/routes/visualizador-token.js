// ============================================================
// wpp/routes/visualizador-token.js — V.2609141810
// ROTA PÚBLICA PARA VISUALIZAR ARQUIVOS VIA TOKEN
// Aceita: /visualizador/:token?lancamento_id=X
// ============================================================

import express from 'express';
import pkg from 'pg';

const { Pool } = pkg;
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * GET /visualizador/:token
 * Redireciona para o visualizador com os arquivos do token
 * Query params opcionais:
 * - lancamento_id: ID do lançamento específico (se omitido, mostra todos)
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { lancamento_id } = req.query;

    // Buscar token no banco
    const result = await pool.query(
      'SELECT todos_arquivos, extrato_ref, descricao FROM file_tokens WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Token Inválido</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #1a1a1a;
              color: #fff;
            }
            .error {
              text-align: center;
              padding: 40px;
              background: #2c2c2c;
              border-radius: 8px;
              border: 2px solid #e74c3c;
            }
            h1 { color: #e74c3c; margin-bottom: 10px; }
            p { color: #b0b0b0; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>⚠️ Token Inválido</h1>
            <p>Este link não é válido ou foi revogado.</p>
            <p style="font-size: 12px; margin-top: 20px;">Token: ${token}</p>
          </div>
        </body>
        </html>
      `);
    }

    const todosArquivos = result.rows[0].todos_arquivos;
    const extratoRef = result.rows[0].extrato_ref;

    let fileUrls = [];

    // Se especificou lancamento_id, pegar só daquele lançamento
    if (lancamento_id && todosArquivos[lancamento_id]) {
      const arquivos = todosArquivos[lancamento_id];
      fileUrls = arquivos.map(a => a.url);
    } else {
      // Senão, pegar TODOS os arquivos de TODOS os lançamentos
      Object.values(todosArquivos).forEach(arquivos => {
        arquivos.forEach(a => fileUrls.push(a.url));
      });
    }

    if (fileUrls.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sem Arquivos</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #1a1a1a;
              color: #fff;
            }
            .error {
              text-align: center;
              padding: 40px;
              background: #2c2c2c;
              border-radius: 8px;
              border: 2px solid #f39c12;
            }
            h1 { color: #f39c12; margin-bottom: 10px; }
            p { color: #b0b0b0; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>📂 Sem Arquivos</h1>
            <p>Não há arquivos disponíveis ${lancamento_id ? 'para este lançamento' : 'neste extrato'}.</p>
            <p style="font-size: 12px; margin-top: 20px;">Extrato: ${extratoRef}</p>
          </div>
        </body>
        </html>
      `);
    }

    // Construir URL do visualizador com os arquivos
    const visualizadorUrl = 'https://calendario-boat-production.up.railway.app/visualizador_anexo.html?' +
      fileUrls.map((url, i) => `url${i + 1}=${encodeURIComponent(url)}`).join('&');

    // Redirecionar
    res.redirect(visualizadorUrl);

  } catch (err) {
    console.error('❌ Erro ao processar token:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Erro</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #1a1a1a;
            color: #fff;
          }
          .error {
            text-align: center;
            padding: 40px;
            background: #2c2c2c;
            border-radius: 8px;
            border: 2px solid #e74c3c;
          }
          h1 { color: #e74c3c; margin-bottom: 10px; }
          p { color: #b0b0b0; }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>❌ Erro ao processar requisição</h1>
          <p>Ocorreu um erro ao tentar acessar os arquivos.</p>
          <p style="font-size: 12px; margin-top: 20px; color: #e74c3c;">${err.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

export default router;

// ============================================================
// FIM
// ============================================================
