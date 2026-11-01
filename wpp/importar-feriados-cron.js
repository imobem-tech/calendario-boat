// ============================================================
// importar-feriados-cron.js — V.2611011535
// Importação automática de feriados (Railway Cron)
// Roda todo dia 1 de cada mês às 06:00 BRT
// ============================================================

import https from 'https';
import pkg from 'pg';
const { Pool } = pkg;

// Feriados estaduais do Tocantins
const FERIADOS_ESTADUAL_TO = [
    { mes: 3, dia: 18, nome: 'Autonomia do Estado do Tocantins', tipo: 'Estadual', abrangencia: 'TO' },
    { mes: 9, dia: 8, nome: 'Nossa Senhora da Natividade (Padroeira do TO)', tipo: 'Estadual', abrangencia: 'TO' },
    { mes: 10, dia: 5, nome: 'Criação do Estado do Tocantins', tipo: 'Estadual', abrangencia: 'TO' }
];

// Feriados municipais de Palmas/TO
const FERIADOS_MUNICIPAL_PALMAS = [
    { mes: 5, dia: 20, nome: 'Aniversário de Palmas', tipo: 'Municipal', abrangencia: 'Palmas/TO', obs: 'Data de instalação oficial da cidade (20/05/1990)' }
];

/**
 * Busca feriados nacionais da Brasil API
 */
async function buscarFeriadosNacionais(ano) {
    return new Promise((resolve, reject) => {
        const url = `https://brasilapi.com.br/api/feriados/v1/${ano}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const feriados = JSON.parse(data);
                    resolve(feriados.map(f => {
                        const [ano, mes, dia] = f.date.split('-');
                        return {
                            nome: f.name,
                            data: new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia)),
                            tipo: 'Nacional',
                            abrangencia: 'Brasil',
                            diaSemana: f.weekday
                        };
                    }));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Gera feriados locais para um ano
 */
function gerarFeriadosLocais(ano) {
    const feriados = [];
    const getDiaSemana = (data) => {
        const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
        return dias[data.getDay()];
    };

    [...FERIADOS_ESTADUAL_TO, ...FERIADOS_MUNICIPAL_PALMAS].forEach(f => {
        const data = new Date(ano, f.mes - 1, f.dia, 0, 0, 0, 0);
        feriados.push({
            nome: f.nome,
            data: data,
            tipo: f.tipo,
            abrangencia: f.abrangencia,
            diaSemana: getDiaSemana(data),
            obs: f.obs || null
        });
    });

    return feriados;
}

/**
 * Filtra feriados dentro do período
 */
function filtrarPorPeriodo(feriados, dataInicio, dataFim) {
    return feriados.filter(f => {
        const dataFeriado = new Date(f.data);
        dataFeriado.setHours(0, 0, 0, 0);
        const inicio = new Date(dataInicio);
        inicio.setHours(0, 0, 0, 0);
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);
        return dataFeriado >= inicio && dataFeriado <= fim;
    });
}

/**
 * Executa importação de feriados
 */
export async function executarImportacaoFeriados() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const hoje = new Date();
        const dataFinal = new Date(hoje);
        dataFinal.setDate(dataFinal.getDate() + 180);

        const anoAtual = hoje.getFullYear();
        const anoFinal = dataFinal.getFullYear();
        const anos = anoAtual === anoFinal ? [anoAtual] : [anoAtual, anoFinal];

        console.log(`\n📅 [FERIADOS] Importação iniciada: ${hoje.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log(`📅 [FERIADOS] Período: ${hoje.toLocaleDateString('pt-BR')} até ${dataFinal.toLocaleDateString('pt-BR')}`);
        console.log(`📅 [FERIADOS] Anos: ${anos.join(', ')}`);

        // Buscar feriados
        let todosFeriados = [];
        for (const ano of anos) {
            const nacionais = await buscarFeriadosNacionais(ano);
            const locais = gerarFeriadosLocais(ano);
            todosFeriados = [...todosFeriados, ...nacionais, ...locais];
        }

        const feriadosNoPeriodo = filtrarPorPeriodo(todosFeriados, hoje, dataFinal);
        console.log(`📅 [FERIADOS] Feriados encontrados: ${feriadosNoPeriodo.length}`);

        // Inserir no banco
        let inseridos = 0;
        let duplicados = 0;

        for (const feriado of feriadosNoPeriodo) {
            const anoFeriado = feriado.data.getFullYear();
            const ano = feriado.data.getFullYear();
            const mes = String(feriado.data.getMonth() + 1).padStart(2, '0');
            const dia = String(feriado.data.getDate()).padStart(2, '0');
            const dataFormatada = `${ano}-${mes}-${dia}`;

            // Verificar duplicata
            const existe = await pool.query(`
                SELECT COUNT(*) as total
                FROM "Agenda_comp_02_feriados"
                WHERE "Nome_Feriado" = $1
                AND "Tipo_Feriado" = $2
                AND EXTRACT(YEAR FROM "Dt_Feriado") = $3
                AND "Dt_Exclusao" IS NULL
            `, [feriado.nome, feriado.tipo, anoFeriado]);

            if (parseInt(existe.rows[0].total) > 0) {
                duplicados++;
            } else {
                await pool.query(`
                    INSERT INTO "Agenda_comp_02_feriados" (
                        "Dt_Feriado",
                        "Dt_Criacao",
                        "Nome_Feriado",
                        "Tipo_Feriado",
                        "Abrangencia",
                        "Dia_Semana",
                        "Observacao"
                    ) VALUES (
                        $1::date,
                        TIMEZONE('America/Sao_Paulo', NOW()),
                        $2, $3, $4, $5, $6
                    )
                `, [dataFormatada, feriado.nome, feriado.tipo, feriado.abrangencia, feriado.diaSemana, feriado.obs]);
                inseridos++;
            }
        }

        console.log(`✅ [FERIADOS] Inseridos: ${inseridos}`);
        console.log(`⏭️  [FERIADOS] Duplicados: ${duplicados}`);
        console.log(`✅ [FERIADOS] Importação concluída!\n`);

        await pool.end();

        return { success: true, inseridos, duplicados, total: feriadosNoPeriodo.length };

    } catch (error) {
        console.error('❌ [FERIADOS] Erro na importação:', error);
        await pool.end();
        return { success: false, error: error.message };
    }
}
