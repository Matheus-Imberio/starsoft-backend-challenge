# Cenário de Teste Guiado (Fase 11)
# Demonstra: 2 usuários tentando reservar o mesmo assento -> apenas 1 reserva criada -> pagamento -> sem duplicidade
# Uso: .\scripts\test-concurrency-scenario.ps1
# API deve estar rodando em http://localhost:3000
# Pode ser executado várias vezes: usa emails únicos por execução para evitar conflito com dados anteriores.

$baseUrl = "http://localhost:3000"
$ErrorActionPreference = "Stop"
$runId = [DateTime]::UtcNow.ToString("yyyyMMddHHmmss")

function Invoke-Api {
  param([string]$Method, [string]$Path, [object]$Body = $null)
  $uri = "$baseUrl$Path"
  $params = @{ Uri = $uri; Method = $Method; ContentType = "application/json" }
  if ($Body) { $params.Body = ($Body | ConvertTo-Json) }
  return Invoke-RestMethod @params
}

function Invoke-ApiOrError {
  param([string]$Method, [string]$Path, [object]$Body = $null)
  try {
    $result = Invoke-Api -Method $Method -Path $Path -Body $Body
    return @{ success = $true; data = $result }
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $msg = $_.ErrorDetails.Message
    return @{ success = $false; statusCode = $statusCode; message = $msg }
  }
}

Write-Host "========================================" -ForegroundColor Magenta
Write-Host " CENARIO DE TESTE GUIADO - FASE 11" -ForegroundColor Magenta
Write-Host " 2 usuarios, mesmo assento, sem duplicidade" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

# 1. Criar sessão "Filme X – 19:00"
Write-Host "[1] Criar sessao 'Filme X - 19:00'..." -ForegroundColor Cyan
$session = Invoke-Api -Method Post -Path "/sessions" -Body @{
  movieTitle = "Filme X - 19:00"
  roomName   = "Sala 1"
  startTime  = "2026-02-01T19:00:00.000Z"
  priceCents = 2500
}
$sessionId = $session.id
Write-Host "    Sessao criada: $sessionId`n" -ForegroundColor White

# 2. Criar 16 assentos
Write-Host "[2] Criar 16 assentos (A1 a A16)..." -ForegroundColor Cyan
$seatNumbers = 1..16 | ForEach-Object { "A$_" }
$seats = Invoke-Api -Method Post -Path "/sessions/$sessionId/seats" -Body @{ seatNumbers = $seatNumbers }
$seatId = $seats[0].id
Write-Host "    Assentos criados. Assento alvo (A1): $seatId`n" -ForegroundColor White

# 3. Criar 2 usuários (emails únicos por execução para permitir rodar o script várias vezes)
Write-Host "[3] Criar 2 usuarios (Ana e Bruno)..." -ForegroundColor Cyan
$user1 = Invoke-Api -Method Post -Path "/users" -Body @{ name = "Ana"; email = "ana-$runId@test.com" }
$user2 = Invoke-Api -Method Post -Path "/users" -Body @{ name = "Bruno"; email = "bruno-$runId@test.com" }
Write-Host "    Ana:  $($user1.id)" -ForegroundColor White
Write-Host "    Bruno: $($user2.id)`n" -ForegroundColor White

# 4. Simular 2 usuários tentando reservar o mesmo assento (sequencial: Ana primeiro, Bruno em seguida)
Write-Host "[4] Ana tenta reservar o assento A1..." -ForegroundColor Cyan
$res1 = Invoke-ApiOrError -Method Post -Path "/reservations" -Body @{
  userId    = $user1.id
  sessionId = $sessionId
  seatId    = $seatId
}
if ($res1.success) {
  Write-Host "    OK - Reserva criada: $($res1.data.id)" -ForegroundColor Green
  $reservationId = $res1.data.id
} else {
  Write-Host "    Falhou: $($res1.message)" -ForegroundColor Red
  exit 1
}

Write-Host "`n    Bruno tenta reservar o MESMO assento A1..." -ForegroundColor Cyan
$res2 = Invoke-ApiOrError -Method Post -Path "/reservations" -Body @{
  userId    = $user2.id
  sessionId = $sessionId
  seatId    = $seatId
}
if (-not $res2.success) {
  Write-Host "    Esperado: Bruno nao consegue. Resposta: $($res2.statusCode) - $($res2.message)" -ForegroundColor Green
} else {
  Write-Host "    ERRO: Bruno obteve reserva (duplicidade!)" -ForegroundColor Red
  exit 1
}

# 5. Mostrar que apenas 1 reserva existe (Ana tem 1, Bruno tem 0)
Write-Host "`n[5] Quantidade de reservas por usuario:" -ForegroundColor Cyan
$reservationsAna = Invoke-Api -Method Get -Path "/reservations/user/$($user1.id)"
$reservationsBruno = Invoke-Api -Method Get -Path "/reservations/user/$($user2.id)"
$countAna = if ($reservationsAna) { $reservationsAna.Count } else { 0 }
$countBruno = if ($reservationsBruno) { $reservationsBruno.Count } else { 0 }
Write-Host "    Ana:  $countAna reserva(s)" -ForegroundColor White
Write-Host "    Bruno: $countBruno reserva(s)" -ForegroundColor White
if ($countAna -eq 1 -and $countBruno -eq 0) {
  Write-Host "    Apenas 1 reserva criada (Ana). OK.`n" -ForegroundColor Green
} else {
  Write-Host "    Esperado: Ana=1, Bruno=0" -ForegroundColor Red
  exit 1
}

# 6. Confirmar pagamento (Ana)
Write-Host "[6] Ana confirma pagamento da reserva..." -ForegroundColor Cyan
$sale = Invoke-Api -Method Post -Path "/payments/confirm" -Body @{ reservationId = $reservationId }
$valorReais = [math]::Round($sale.amountPaidCents / 100, 2)
Write-Host "    Venda confirmada: $($sale.id), valor: R$ $valorReais`n" -ForegroundColor Green

# 7. Provar que nao ha duplicidade: Bruno tenta reservar (ja vendido)
Write-Host "[7] Bruno tenta reservar o mesmo assento (ja vendido)..." -ForegroundColor Cyan
$res3 = Invoke-ApiOrError -Method Post -Path "/reservations" -Body @{
  userId    = $user2.id
  sessionId = $sessionId
  seatId    = $seatId
}
if (-not $res3.success) {
  Write-Host "    Esperado: 409 - Assento ja vendido. Resposta: $($res3.statusCode)`n" -ForegroundColor Green
} else {
  Write-Host "    ERRO: Bruno conseguiu reservar assento ja vendido (duplicidade!)" -ForegroundColor Red
  exit 1
}

# 8. Historico: apenas Ana tem compra
Write-Host "[8] Historico de compras:" -ForegroundColor Cyan
$historyAna = Invoke-Api -Method Get -Path "/payments/user/$($user1.id)/history"
$historyBruno = Invoke-Api -Method Get -Path "/payments/user/$($user2.id)/history"
Write-Host "    Ana:  $($historyAna.Count) compra(s)" -ForegroundColor White
Write-Host "    Bruno: $($historyBruno.Count) compra(s)" -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host " CENARIO CONCLUIDO - SEM DUPLICIDADE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
