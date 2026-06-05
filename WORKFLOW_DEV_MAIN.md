# 🔄 Workflow DEV → MAIN (Guia Rápido)
## V.2606051110

---

## 🚫 **REGRA #1: NUNCA COMMITAR DIRETO NA MAIN**

---

## ✅ **Workflow Obrigatório:**

### **Passo 1: Antes de Começar**
```bash
git checkout dev
git pull origin dev
git merge main  # Pega mudanças recentes da produção
```

### **Passo 2: Desenvolver**
```bash
# Editar arquivos normalmente
# Testar localmente

git add .
git commit -m "feat: Descrição da mudança"
git push origin dev
```

### **Passo 3: Testar Preview**
- Railway DEV: https://calendario-boat-dev.up.railway.app/
- Vercel Preview: URLs com hash aleatório

✅ **SE OK** → prosseguir  
❌ **SE ERRO** → voltar ao Passo 2

### **Passo 4: Promover para Produção**
```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

Deploy automático acontece em ~10 segundos ✅

---

## 🚨 **URGÊNCIA? MESMO ASSIM USA DEV!**

```bash
# Correção rápida (2 minutos no total):
git checkout dev
# ... editar e corrigir ...
git add . && git commit -m "hotfix: Correção urgente"
git push origin dev

# Merge imediato:
git checkout main && git merge dev && git push origin main
```

**Tempo extra:** 30 segundos  
**Risco evitado:** Perder correções anteriores ✅

---

## 🔍 **Verificar Divergências:**

```bash
# Ver o que está em dev mas não em main:
git log main..dev --oneline

# Ver diferenças em arquivo específico:
git diff main dev -- public/index.html
```

---

## 📊 **Checklist Rápido:**

Antes de QUALQUER mudança:
```
[ ] git checkout dev
[ ] git pull origin dev  
[ ] git merge main
[ ] AGORA pode editar
```

Depois de testar no preview:
```
[ ] git checkout main
[ ] git merge dev
[ ] git push origin main
```

---

## 🎯 **Resumo Ultra-Rápido:**

```
SEMPRE:  dev → testar → main
NUNCA:   editar direto na main
```

---

## ⚠️ **O Que Aconteceu em 04/06:**

**ERRADO (causou o bug):**
```bash
git checkout main  # ❌
# editar public/agendar.html
git commit  # ❌ Perdeu correções do dev!
```

**CERTO (deveria ter sido):**
```bash
git checkout dev  # ✅
git merge main     # ✅ Pega correções
# editar public/agendar.html
git commit && git push origin dev  # ✅
git checkout main && git merge dev  # ✅
```

---

## 📝 **Proteção Adicional (Opcional):**

Adicionar em `.git/hooks/pre-commit`:
```bash
#!/bin/bash
branch=$(git symbolic-ref HEAD | sed -e 's,.*/\(.*\),\1,')
if [ "$branch" = "main" ]; then
  echo "❌ ERRO: Não commite direto na main! Use: git checkout dev"
  exit 1
fi
```

```bash
chmod +x .git/hooks/pre-commit
```

---

## 🎓 **Para a Equipe:**

**Mantra:**
> "Dev primeiro, sempre. Main só recebe merge."

**Motivo:**
- Dev = onde testamos e desenvolvemos
- Main = espelho validado do dev

**Benefício:**
- Zero chance de perder correções ✅
- Histórico limpo e rastreável ✅
- Rollback fácil se necessário ✅

---

<!-- V.2606051110 -->
