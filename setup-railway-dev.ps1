# ============================================================
# Script de Configuração Automática Railway DEV
# V.2606041145
# ============================================================

Write-Host "🚀 Setup Railway DEV - Calendario Allmax" -ForegroundColor Cyan
Write-Host ""

# Verificar se Railway CLI está instalado
Write-Host "📦 Verificando Railway CLI..." -ForegroundColor Yellow
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue

if (-not $railwayInstalled) {
    Write-Host "❌ Railway CLI não encontrado. Instalando..." -ForegroundColor Red
    Write-Host ""
    Write-Host "Execute:" -ForegroundColor Yellow
    Write-Host "npm install -g @railway/cli" -ForegroundColor Green
    Write-Host ""
    Write-Host "Depois execute este script novamente." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Railway CLI instalado" -ForegroundColor Green
Write-Host ""

# Login no Railway
Write-Host "🔐 Fazendo login no Railway..." -ForegroundColor Yellow
railway login

# Listar projetos
Write-Host ""
Write-Host "📋 Listando projetos..." -ForegroundColor Yellow
railway list

Write-Host ""
Write-Host "⚠️  ATENÇÃO: Próximos passos MANUAIS no Railway Dashboard" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  Acesse: https://railway.app/dashboard" -ForegroundColor Cyan
Write-Host "2️⃣  Selecione projeto: calendario-boat" -ForegroundColor Cyan
Write-Host "3️⃣  Vá no ambiente: deepproxyterminals" -ForegroundColor Cyan
Write-Host "4️⃣  Clique: + New Service → GitHub Repository" -ForegroundColor Cyan
Write-Host "5️⃣  Escolha: imobem-tech/calendario-boat" -ForegroundColor Cyan
Write-Host "6️⃣  Branch: dev (IMPORTANTE!)" -ForegroundColor Red
Write-Host "7️⃣  Após deploy, configure variáveis:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    RAILWAY_ENVIRONMENT=development" -ForegroundColor Green
Write-Host "    DATABASE_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require" -ForegroundColor Green
Write-Host "    POSTGRES_URL=postgresql://neondb_owner:npg_GBncO6VelY8C@ep-steep-silence-acy3c620.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require" -ForegroundColor Green
Write-Host ""
Write-Host "8️⃣  Após deploy completo, acesse: https://[sua-url].railway.app/qr" -ForegroundColor Cyan
Write-Host "9️⃣  Escaneie QR com número DIFERENTE do PROD" -ForegroundColor Red
Write-Host ""
Write-Host "✅ Pronto para testar!" -ForegroundColor Green
