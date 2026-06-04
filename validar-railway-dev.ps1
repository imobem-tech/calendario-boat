# ============================================================
# Script de Validação Railway DEV
# V.2606041215
# ============================================================

$URL_DEV = "https://zucchini-achievement-desenvolvimento.up.railway.app"
$URL_PROD = "https://calendario-boat-production.up.railway.app"  # Ajustar se necessário

Write-Host "🔍 Validando Railway DEV vs PROD" -ForegroundColor Cyan
Write-Host ""
Write-Host "DEV:  $URL_DEV" -ForegroundColor Yellow
Write-Host "PROD: $URL_PROD" -ForegroundColor Yellow
Write-Host ""

# ============================================================
# Função para testar endpoint
# ============================================================
function Test-Endpoint {
    param(
        [string]$Url,
        [string]$Nome
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ $Nome : OK (200)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "⚠️  $Nome : Status $($response.StatusCode)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "❌ $Nome : FALHOU - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# ============================================================
# Função para verificar status do bot
# ============================================================
function Test-BotStatus {
    param(
        [string]$Url,
        [string]$Ambiente
    )

    Write-Host ""
    Write-Host "📊 Status Bot $Ambiente" -ForegroundColor Cyan

    try {
        $response = Invoke-RestMethod -Uri "$Url/status" -TimeoutSec 10

        Write-Host "  Conectado: $($response.conectado)" -ForegroundColor $(if ($response.conectado) { "Green" } else { "Yellow" })
        Write-Host "  Último evento: $($response.ultimoEvento)" -ForegroundColor Gray

        if ($response.ultimaConexaoEm) {
            Write-Host "  Última conexão: $($response.ultimaConexaoEm)" -ForegroundColor Gray
        }

        return $response.conectado
    } catch {
        Write-Host "  ❌ Erro ao obter status: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# ============================================================
# Testes DEV
# ============================================================
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VALIDAÇÃO AMBIENTE DEV" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$devOk = @{
    raiz = Test-Endpoint "$URL_DEV/" "Página principal"
    status = Test-Endpoint "$URL_DEV/status" "Status API"
    qr = Test-Endpoint "$URL_DEV/qr" "QR Code"
}

$devBotConectado = Test-BotStatus $URL_DEV "DEV"

# ============================================================
# Resumo Final
# ============================================================
Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  RESUMO" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$devTotal = ($devOk.Values | Where-Object { $_ -eq $true }).Count
$devCount = $devOk.Count

Write-Host "DEV:  $devTotal/$devCount endpoints OK" -ForegroundColor $(if ($devTotal -eq $devCount) { "Green" } else { "Yellow" })
Write-Host "      Bot conectado: $(if ($devBotConectado) { "✅ SIM" } else { "❌ NÃO (escanear QR em $URL_DEV/qr)" })" -ForegroundColor $(if ($devBotConectado) { "Green" } else { "Yellow" })

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  LINKS RÁPIDOS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔗 QR Code DEV:    $URL_DEV/qr" -ForegroundColor Cyan
Write-Host "🔗 Status DEV:     $URL_DEV/status" -ForegroundColor Cyan
Write-Host "🔗 Mapa DEV:       $URL_DEV/" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Validação Crítica: Cron Jobs
# ============================================================
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VALIDAÇÃO CRÍTICA" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  LEMBRETE IMPORTANTE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Bot DEV deve usar número WhatsApp DIFERENTE do PROD" -ForegroundColor White
Write-Host "2. Adicionar bot DEV APENAS em grupos de teste" -ForegroundColor White
Write-Host "3. NUNCA adicionar em grupos reais de clientes" -ForegroundColor White
Write-Host "4. Cron jobs devem estar DESATIVADOS no DEV" -ForegroundColor White
Write-Host ""
Write-Host "Para verificar logs no Railway:" -ForegroundColor Cyan
Write-Host "https://railway.app → calendario-boat → deepproxyterminals → Deployments" -ForegroundColor Gray
Write-Host ""
Write-Host "Procure por:" -ForegroundColor Cyan
Write-Host "  🔧 Ambiente detectado: desenvolvimento" -ForegroundColor Green
Write-Host "  📋 Cron jobs: DESATIVADOS" -ForegroundColor Green
Write-Host ""
