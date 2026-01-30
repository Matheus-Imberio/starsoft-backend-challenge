# Teste da API de cinema - rode com a API em http://localhost:3000
# Uso: .\scripts\test-api.ps1
# Pode ser executado varias vezes: usa emails unicos por execucao.
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

Write-Host "=== 1. GET / (health) ===" -ForegroundColor Cyan
$hello = Invoke-Api -Method Get -Path "/"
Write-Host $hello

Write-Host "`n=== 2. POST /users (criar usuario) ===" -ForegroundColor Cyan
$user = Invoke-Api -Method Post -Path "/users" -Body @{ name = "Usuario Teste"; email = "teste-$runId@example.com" }
Write-Host "User ID: $($user.id)"
$userId = $user.id

Write-Host "`n=== 3. POST /sessions (criar sessao) ===" -ForegroundColor Cyan
$session = Invoke-Api -Method Post -Path "/sessions" -Body @{
  movieTitle = "Filme X - 19:00"
  roomName   = "Sala 1"
  startTime  = "2026-02-01T19:00:00.000Z"
  priceCents = 2500
}
Write-Host "Session ID: $($session.id)"
$sessionId = $session.id

Write-Host "`n=== 4. POST /sessions/:id/seats (16 assentos) ===" -ForegroundColor Cyan
$seatNumbers = 1..16 | ForEach-Object { "A$_" }
$seats = Invoke-Api -Method Post -Path "/sessions/$sessionId/seats" -Body @{ seatNumbers = $seatNumbers }
Write-Host "Criados $($seats.Count) assentos. Primeiro seat ID: $($seats[0].id)"
$seatId = $seats[0].id

Write-Host "`n=== 5. GET /sessions/:id/availability ===" -ForegroundColor Cyan
$availability = Invoke-Api -Method Get -Path "/sessions/$sessionId/availability"
Write-Host "Assentos na sessao: $($availability.Count)"

Write-Host "`n=== 6. POST /reservations (reservar assento) ===" -ForegroundColor Cyan
$reservation = Invoke-Api -Method Post -Path "/reservations" -Body @{
  userId     = $userId
  sessionId  = $sessionId
  seatId     = $seatId
}
Write-Host "Reserva criada: $($reservation.id), expires_at: $($reservation.expiresAt)"

Write-Host "`n=== 7. POST /payments/confirm ===" -ForegroundColor Cyan
$sale = Invoke-Api -Method Post -Path "/payments/confirm" -Body @{ reservationId = $reservation.id }
$valorReais = [math]::Round($sale.amountPaidCents / 100, 2)
Write-Host "Venda confirmada: $($sale.id), valor: R$ $valorReais"

Write-Host "`n=== 8. GET /payments/user/:userId/history ===" -ForegroundColor Cyan
$history = Invoke-Api -Method Get -Path "/payments/user/$userId/history"
Write-Host "Compras do usuario: $($history.Count)"

Write-Host "`n=== 9. Tentar reservar mesmo assento (deve falhar - ja vendido) ===" -ForegroundColor Cyan
$user2 = Invoke-Api -Method Post -Path "/users" -Body @{ name = "Usuario 2"; email = "user2-$runId@example.com" }
try {
  Invoke-Api -Method Post -Path "/reservations" -Body @{
    userId    = $user2.id
    sessionId = $sessionId
    seatId    = $seatId
  }
  Write-Host "ERRO: deveria ter falhado (assento ja vendido)" -ForegroundColor Red
} catch {
  $msg = if ($_.ErrorDetails.Message) {
    try { ($_.ErrorDetails.Message | ConvertFrom-Json).message } catch { $_.ErrorDetails.Message }
  } else { $_.Exception.Message }
  Write-Host "OK: assento ja vendido - $msg" -ForegroundColor Green
}

Write-Host "`n=== Testes concluidos ===" -ForegroundColor Green
