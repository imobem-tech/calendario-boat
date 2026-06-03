# 🛑 PARAR MENSAGENS URGENTE

## OPÇÃO 1: Limpar barcos simulados IMEDIATAMENTE

Execute no Neon Console:

```sql
DELETE FROM public.wpp_localizacao_emb WHERE pb >= 100 AND pb < 120;
DELETE FROM public."P_BOAT_z_10_Saida_Emb" WHERE "Cod_Emb_PB" >= 100 AND "Cod_Emb_PB" < 120;
```

Isso remove todos os 20 barcos simulados!

---

## OPÇÃO 2: Desabilitar endpoint temporariamente

No Railway Dashboard:
1. Settings → Variables
2. Adicionar: `DISABLE_SIMULAR=true`
3. Redeploy

---

## OPÇÃO 3: Restart do servidor Railway

No Railway Dashboard:
1. Deployments → 3 pontinhos → Restart

---

## SQL RÁPIDO (copie e execute no Neon):

DELETE FROM public.wpp_localizacao_emb WHERE pb >= 100 AND pb < 120;
DELETE FROM public."P_BOAT_z_10_Saida_Emb" WHERE "Cod_Emb_PB" >= 100 AND "Cod_Emb_PB" < 120;
