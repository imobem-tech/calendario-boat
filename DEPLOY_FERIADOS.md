# 🚀 Deploy - Importação Automática de Feriados
V.2611011531

## ✅ O que foi criado:

1. **`/api/importar_feriados.js`** - Serverless function da Vercel
2. **`vercel.json`** - Configuração do cron job
3. **Schedule**: Todo dia 1 de cada mês às 06:00 (horário de Brasília)

## 📋 Passo a Passo para Deploy:

### 1. Configurar Variável de Ambiente no Vercel

Acesse: https://vercel.com/seu-projeto/settings/environment-variables

Adicione:
- **Nome**: `CRON_SECRET`
- **Valor**: `sua-senha-secreta-aqui` (gere uma senha forte)
- **Environment**: Production, Preview, Development

### 2. Fazer o Deploy

```bash
cd D:\OneDrive\GESTAO_DZ\Claude_DZ\projetos\calendario_allmax

# Commit das alterações
git add vercel.json api/importar_feriados.js
git commit -m "feat: adicionar cron job para importação automática de feriados

- Cron roda todo dia 1 às 06:00 BRT
- Importa feriados dos próximos 180 dias
- Verifica duplicatas por nome+tipo+ano
- V.2611011531"

# Push para o repositório
git push origin main
```

O Vercel vai fazer deploy automaticamente!

### 3. Testar Manualmente (opcional)

Após o deploy, teste chamando o endpoint:

```bash
curl -X GET https://seu-dominio.vercel.app/api/importar_feriados \
  -H "Authorization: Bearer sua-senha-secreta-aqui"
```

## 🕐 Schedule do Cron:

- **Horário UTC**: 09:00
- **Horário Brasil (GMT-3)**: 06:00
- **Frequência**: Todo dia 1 de cada mês
- **Cron Expression**: `0 9 1 * *`

## 🔍 Verificar se está funcionando:

1. **Dashboard Vercel**: https://vercel.com/seu-projeto/deployments
2. **Logs do Cron**: https://vercel.com/seu-projeto/logs
3. **Banco de Dados**: Consultar tabela `Agenda_comp_02_feriados`

## 📊 O que o cron faz:

1. ✅ Busca feriados nacionais (Brasil API)
2. ✅ Adiciona feriados estaduais (TO)
3. ✅ Adiciona feriados municipais (Palmas)
4. ✅ Filtra próximos 180 dias
5. ✅ Evita duplicatas (nome+tipo+ano)
6. ✅ Grava com horário de Brasília

## ⚠️ Importante:

- Certifique-se de que `DATABASE_URL` ou `POSTGRES_URL` está configurado no Vercel
- O `CRON_SECRET` é necessário para segurança (evita chamadas não autorizadas)
- O cron só roda em **Production** (não em Preview/Development)

## 🔧 Troubleshooting:

**Cron não executou?**
- Verifique os logs no Vercel
- Confirme que está em Production
- Valide o `CRON_SECRET` nas env vars

**Erro de conexão com banco?**
- Verifique `DATABASE_URL` no Vercel
- Confirme que o Neon está online
- Teste o endpoint manualmente

**Duplicatas sendo criadas?**
- Verifique se a lógica de duplicata está correta
- Confira se o nome do feriado está exatamente igual
