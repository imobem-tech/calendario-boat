import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

console.log('📊 ANALISANDO DESCRIÇÕES MAIS FREQUENTES\n');
console.log('Período: 2026-01 a 2026-07');
console.log('=' .repeat(80) + '\n');

try {
  // Buscar descrições mais frequentes por tipo e empresa
  const query = `
    SELECT
      empresa,
      tipo,
      descricao_original,
      COUNT(*) as vezes,
      SUM(ABS(valor)) as valor_total
    FROM bank_extratos
    WHERE data >= '2026-01-01'
      AND data < '2026-08-01'
      AND descricao_original IS NOT NULL
      AND descricao_original != ''
    GROUP BY empresa, tipo, descricao_original
    HAVING COUNT(*) >= 3
    ORDER BY COUNT(*) DESC, empresa, tipo
    LIMIT 100
  `;

  const result = await pool.query(query);

  if (result.rows.length === 0) {
    console.log('⚠️  Nenhum lançamento encontrado no período.\n');
    console.log('💡 Execute a sincronização dos extratos primeiro.\n');
    await pool.end();
    process.exit(0);
  }

  console.log(`✅ ${result.rows.length} descrições encontradas (com 3+ ocorrências)\n`);

  // Agrupar por tipo
  const porCredito = result.rows.filter(r => r.tipo === 'CREDITO');
  const porDebito = result.rows.filter(r => r.tipo === 'DEBITO');

  // CREDITO
  console.log('💰 CRÉDITO (Receitas) - TOP 30:\n');
  console.log('Vezes | Empresa | Descrição                                          | Total');
  console.log('-'.repeat(80));
  porCredito.slice(0, 30).forEach(r => {
    const desc = r.descricao_original.substring(0, 50).padEnd(50);
    const vezes = String(r.vezes).padStart(5);
    const empresa = r.empresa.padEnd(7);
    const total = `R$ ${parseFloat(r.valor_total).toFixed(2)}`;
    console.log(`${vezes} | ${empresa} | ${desc} | ${total}`);
  });

  // DEBITO
  console.log('\n\n💸 DÉBITO (Despesas) - TOP 30:\n');
  console.log('Vezes | Empresa | Descrição                                          | Total');
  console.log('-'.repeat(80));
  porDebito.slice(0, 30).forEach(r => {
    const desc = r.descricao_original.substring(0, 50).padEnd(50);
    const vezes = String(r.vezes).padStart(5);
    const empresa = r.empresa.padEnd(7);
    const total = `R$ ${parseFloat(r.valor_total).toFixed(2)}`;
    console.log(`${vezes} | ${empresa} | ${desc} | ${total}`);
  });

  // Sugestões de categorias
  console.log('\n\n' + '='.repeat(80));
  console.log('💡 SUGESTÕES DE CATEGORIAS BASEADAS NOS DADOS REAIS:\n');

  // Agrupar similaridades
  const sugestoes = new Map();

  result.rows.forEach(r => {
    const desc = r.descricao_original.toUpperCase();

    // Padrões comuns
    if (desc.includes('PIX') || desc.includes('TED') || desc.includes('DOC')) {
      if (r.tipo === 'CREDITO') {
        sugestoes.set('Recebimento PIX/TED', { tipo: 'CREDITO', count: (sugestoes.get('Recebimento PIX/TED')?.count || 0) + parseInt(r.vezes) });
      } else {
        sugestoes.set('Transferência Enviada', { tipo: 'DEBITO', count: (sugestoes.get('Transferência Enviada')?.count || 0) + parseInt(r.vezes) });
      }
    }

    if (desc.includes('MENSALIDADE') || desc.includes('LOCAÇÃO') || desc.includes('ALUGUEL')) {
      sugestoes.set('Mensalidade/Locação', { tipo: 'CREDITO', count: (sugestoes.get('Mensalidade/Locação')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('TAXA') || desc.includes('TARIFA')) {
      sugestoes.set('Taxas Bancárias', { tipo: 'DEBITO', count: (sugestoes.get('Taxas Bancárias')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('COMBUSTIVEL') || desc.includes('COMBUST') || desc.includes('GASOLINA') || desc.includes('DIESEL')) {
      sugestoes.set('Combustível', { tipo: 'DEBITO', count: (sugestoes.get('Combustível')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('FOLHA') || desc.includes('SALARIO') || desc.includes('ENCARGO')) {
      sugestoes.set('Folha de Pagamento', { tipo: 'DEBITO', count: (sugestoes.get('Folha de Pagamento')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('IPTU') || desc.includes('IMPOSTO')) {
      sugestoes.set('IPTU/Impostos', { tipo: 'DEBITO', count: (sugestoes.get('IPTU/Impostos')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('ENERGIA') || desc.includes('CELESC') || desc.includes('LUZ')) {
      sugestoes.set('Energia Elétrica', { tipo: 'DEBITO', count: (sugestoes.get('Energia Elétrica')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('CONDOMINIO')) {
      sugestoes.set('Condomínio', { tipo: 'DEBITO', count: (sugestoes.get('Condomínio')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('MANUTENCAO') || desc.includes('MANUTENÇÃO') || desc.includes('REPARO')) {
      sugestoes.set('Manutenção', { tipo: 'DEBITO', count: (sugestoes.get('Manutenção')?.count || 0) + parseInt(r.vezes) });
    }

    if (desc.includes('PROLABORE') || desc.includes('PRÓ-LABORE')) {
      sugestoes.set('Pró-labore', { tipo: 'DEBITO', count: (sugestoes.get('Pró-labore')?.count || 0) + parseInt(r.vezes) });
    }
  });

  // Ordenar por frequência
  const sugestoesOrdenadas = Array.from(sugestoes.entries())
    .sort((a, b) => b[1].count - a[1].count);

  sugestoesOrdenadas.forEach(([nome, dados]) => {
    const tipoEmoji = dados.tipo === 'CREDITO' ? '💰' : '💸';
    console.log(`${tipoEmoji} ${nome.padEnd(30)} → ${dados.tipo.padEnd(7)} (${dados.count}x usada)`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ Análise concluída!\n');

} catch (e) {
  console.error('❌ Erro:', e.message);
} finally {
  await pool.end();
}
