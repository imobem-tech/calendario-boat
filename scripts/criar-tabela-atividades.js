import pkg from 'pg';
import XLSX from 'xlsx';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function criarTabelaAtividades() {
  try {
    console.log('📋 Criando tabela SM_24_Emb_Atividades...\n');

    // 1. DROP (se existir)
    await pool.query('DROP TABLE IF EXISTS public."SM_24_Emb_Atividades"');
    console.log('✅ Tabela antiga removida (se existia)');

    // 2. CREATE TABLE
    await pool.query(`
      CREATE TABLE public."SM_24_Emb_Atividades" (
        "Código" SERIAL PRIMARY KEY,
        "ID_SharePoint" INTEGER,
        "Nome_Atividade" TEXT NOT NULL,
        "Nome_Complemento" TEXT,
        "Emb" INTEGER,
        "Data_Cadastro" TIMESTAMP,
        "Data_Baixa_Cadastro" TIMESTAMP,
        "Ativo" BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo'),
        "updated_at" TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo')
      )
    `);
    console.log('✅ Tabela criada com sucesso!\n');

    // 3. Ler dados do Excel
    console.log('📂 Lendo dados do Excel...');
    const workbook = XLSX.readFile('D:\\OneDrive\\Documentos\\SM_24_Emb_Atividades.xlsx');
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    console.log(`📊 Total de linhas: ${data.length}\n`);

    // 4. Inserir dados
    console.log('💾 Importando dados...\n');
    let importados = 0;

    for (const row of data) {
      try {
        // Converter data Excel (número serial) para Date
        const dataCadastro = row.Data_Cadastro ? 
          excelDateToJS(row.Data_Cadastro) : null;
        const dataBaixa = row.Data_Baixa_Cadastro ? 
          excelDateToJS(row.Data_Baixa_Cadastro) : null;

        await pool.query(`
          INSERT INTO public."SM_24_Emb_Atividades" 
          ("Código", "ID_SharePoint", "Nome_Atividade", "Nome_Complemento", 
           "Emb", "Data_Cadastro", "Data_Baixa_Cadastro", "Ativo")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          row.Código || null,
          row.ID || null,
          row.Nome_Atividade || '',
          row.Nome_Complemento || null,
          row.Emb || null,
          dataCadastro,
          dataBaixa,
          !dataBaixa // Ativo = true se não tem data de baixa
        ]);

        importados++;
        console.log(`✅ ${importados}. ${row.Nome_Atividade}`);

      } catch (err) {
        console.log(`❌ Erro ao importar linha ${row.ID}: ${err.message}`);
      }
    }

    console.log(`\n✅ Importação concluída! ${importados}/${data.length} registros\n`);

    // 5. Ver resultado
    const resultado = await pool.query(`
      SELECT "Código", "Nome_Atividade", "Emb", "Ativo"
      FROM public."SM_24_Emb_Atividades"
      ORDER BY "Código"
    `);

    console.log('📋 Atividades cadastradas:\n');
    resultado.rows.forEach(row => {
      const status = row.Ativo ? '✅' : '❌';
      console.log(`${status} [${row.Código}] ${row.Nome_Atividade} (Emb: ${row.Emb || '-'})`);
    });

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
  }
}

// Converter data serial do Excel para JS Date
function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date = new Date(utc_value * 1000);
  return date.toISOString();
}

criarTabelaAtividades();
