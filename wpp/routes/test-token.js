// Rota de teste para verificar variáveis de ambiente
import express from 'express';

const router = express.Router();

router.get('/test-env', (req, res) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  res.json({
    token_exists: !!token,
    token_length: token ? token.length : 0,
    token_prefix: token ? token.substring(0, 20) + '...' : 'NOT FOUND',
    all_env_keys: Object.keys(process.env).filter(k => k.includes('BLOB'))
  });
});

export default router;
