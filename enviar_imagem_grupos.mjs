// ============================================================
// ENVIAR IMAGEM HM.PNG PARA GRUPOS 576, 573, 586 — V.260911161500
// ============================================================

import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require'
});

// Caminho da imagem
const IMAGEM_PATH = 'C:\\Users\\NOTEBOOK\\Downloads\\HM.png';

// Buscar grupos das embarcações 576, 573, 586
async function buscarGrupos() {
  const result = await pool.query(`
    SELECT grupowppid, nomegrupowpp, pb, cota
    FROM public.wpp_grupos_agenda
    WHERE pb IN ('576', '573', '586')
    ORDER BY pb, cota
  `);
  return result.rows;
}

// Inserir mensagens na fila (como objeto JSON para imagem)
async function inserirNaFila() {
  try {
    // Verificar se a imagem existe
    if (!fs.existsSync(IMAGEM_PATH)) {
      console.error('❌ Imagem não encontrada:', IMAGEM_PATH);
      return;
    }

    const grupos = await buscarGrupos();
    console.log(`\n📱 Encontrados ${grupos.length} grupos\n`);

    // Ler a imagem como base64
    const imagemBuffer = fs.readFileSync(IMAGEM_PATH);
    const imagemBase64 = imagemBuffer.toString('base64');

    // Criar objeto de mensagem com imagem
    const mensagemObj = {
      tipo: 'imagem',
      imagem: imagemBase64,
      mimetype: 'image/png',
      caption: '' // Sem legenda
    };

    let inseridos = 0;

    for (const grupo of grupos) {
      try {
        await pool.query(`
          INSERT INTO public.wpp_fila_agenda (grupo_id, mensagem, status)
          VALUES ($1, $2, 'pendente')
        `, [grupo.grupowppid, JSON.stringify(mensagemObj)]);

        inseridos++;
        console.log(`✅ ${grupo.pb}-${grupo.cota} ${grupo.nomegrupowpp}`);
      } catch (err) {
        console.error(`❌ Erro ao inserir ${grupo.nomegrupowpp}:`, err.message);
      }
    }

    console.log(`\n✅ Total inserido na fila: ${inseridos}/${grupos.length} grupos\n`);

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

inserirNaFila();
