# calendario_allmax — Allmax Gestão de Cotas (Marujo⚓)

## O que é
Sistema de agendamento de saída de embarcações ("boats") com calendário web, bot WhatsApp e integração de pagamentos Asaas.

## Stack
- **Backend/API**: Node.js (ESM), funções serverless na Vercel (`/api`)
- **Banco de dados**: PostgreSQL (`pg` / Pool) — variável de ambiente `DATABASE_URL` ou `POSTGRES_URL`
- **Frontend**: HTML puro (`/public`)
- **Bot WhatsApp**: `@whiskeysockets/baileys` rodando em servidor próprio (`wpp/server.js`)
- **Pagamentos**: Asaas (webhook em `api/asaas_webhook.js`)
- **Deploy API**: Vercel
- **Fuso horário**: sempre `America/Sao_Paulo` (GMT-3)

## Estrutura de pastas
```
api/           → funções serverless Vercel
  agendar.js       → POST /api/agendar — registra agendamento
  availability.js  → GET  /api/availability — calendário de disponibilidade
  asaas_webhook.js → POST webhook Asaas
  desistencia.js   → POST /api/desistencia — cancela agendamento
  inadimplencia_cliente.js
  msg_externa.js
public/        → frontend HTML (index.html, agendar.html)
wpp/           → bot WhatsApp (Baileys)
  server.js        → servidor Express + loop de fila
  db.js            → helpers de banco (buscarGrupoInfo, buscarAutorizado)
  fila.js          → processamento da fila wpp_fila_agenda
  comandos/        → handlers de comandos do bot
    calendario.js, admin.js, menu.js, retorno.js, saida.js, hora_motor.js
```

## Principais tabelas PostgreSQL
| Tabela | Uso |
|--------|-----|
| `public."P_BOAT_z_10_Saida_Emb"` | Agendamentos de saída |
| `public."P_BOAT_4_Autorizados"` | Pessoas autorizadas por embarcação |
| `public.wpp_grupos_agenda` | Grupos WhatsApp por PB/cota |
| `public.wpp_fila_agenda` | Fila de mensagens para o bot |
| `public."Agenda_comp_02_feriados"` | Feriados |

## Regras de negócio importantes
- **Token diário**: tokens expiram no dia (incluem MMDD codificado + DV)
- **Limite de grupo**: cada `Grupo_Comp_letra` tem limite de agendamentos abertos
- **Contingência**: se o dia agendado for hoje e cair ter/qua/qui, pula validação de limite
- **Folga**: segunda-feira é folga (`label: "fol"`); feriado na segunda ativa folga na terça
- **Fuso**: todo `NOW()` e `CURRENT_DATE` no banco usa `AT TIME ZONE 'America/Sao_Paulo'`

## Variáveis de ambiente necessárias
```
DATABASE_URL      → connection string PostgreSQL
POSTGRES_URL      → alternativa ao DATABASE_URL
VERSAO_WPP        → string de versão exibida no WhatsApp
```

## Como rodar localmente
```bash
# Bot WhatsApp
node wpp/server.js

# API (Vercel dev)
vercel dev
```
