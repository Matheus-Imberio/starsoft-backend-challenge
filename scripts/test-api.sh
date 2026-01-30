#!/usr/bin/env bash
# Teste da API de cinema - rode com a API em http://localhost:3000
# Uso: ./scripts/test-api.sh (Linux/macOS)
# Requer: curl, jq. Pode ser executado varias vezes (emails unicos por execucao).

set -e
BASE_URL="${BASE_URL:-http://localhost:3000}"
RUN_ID=$(date -u +%Y%m%d%H%M%S)

api() {
  local method="$1"
  local path="$2"
  local body="$3"
  if [ -n "$body" ]; then
    curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$body" "$BASE_URL$path"
  else
    curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path"
  fi
}

# Retorna corpo e codigo: body em stdout, codigo em HTTP_CODE (global)
api_parse() {
  local result
  result=$(api "$@")
  HTTP_BODY=$(echo "$result" | head -n -1)
  HTTP_CODE=$(echo "$result" | tail -n 1)
}
# Sucesso = 2xx (API pode retornar 200 ou 201)
ok() { [ "${HTTP_CODE:0:1}" = "2" ]; }

echo "=== 1. GET / (health) ==="
api_parse GET "/"
echo "$HTTP_BODY"

echo ""
echo "=== 2. POST /users (criar usuario) ==="
api_parse POST "/users" "{\"name\":\"Usuario Teste\",\"email\":\"teste-$RUN_ID@example.com\"}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
USER_ID=$(echo "$HTTP_BODY" | jq -r '.id')
echo "User ID: $USER_ID"

echo ""
echo "=== 3. POST /sessions (criar sessao) ==="
api_parse POST "/sessions" '{"movieTitle":"Filme X - 19:00","roomName":"Sala 1","startTime":"2026-02-01T19:00:00.000Z","priceCents":2500}'
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
SESSION_ID=$(echo "$HTTP_BODY" | jq -r '.id')
echo "Session ID: $SESSION_ID"

echo ""
echo "=== 4. POST /sessions/:id/seats (16 assentos) ==="
SEAT_NUMS=$(printf '"A%s",' $(seq 1 16) | sed 's/,$//')
api_parse POST "/sessions/$SESSION_ID/seats" "{\"seatNumbers\":[$SEAT_NUMS]}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
SEAT_ID=$(echo "$HTTP_BODY" | jq -r '.[0].id')
echo "Criados 16 assentos. Primeiro seat ID: $SEAT_ID"

echo ""
echo "=== 5. GET /sessions/:id/availability ==="
api_parse GET "/sessions/$SESSION_ID/availability"
COUNT=$(echo "$HTTP_BODY" | jq 'length')
echo "Assentos na sessao: $COUNT"

echo ""
echo "=== 6. POST /reservations (reservar assento) ==="
api_parse POST "/reservations" "{\"userId\":\"$USER_ID\",\"sessionId\":\"$SESSION_ID\",\"seatId\":\"$SEAT_ID\"}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
RESERVATION_ID=$(echo "$HTTP_BODY" | jq -r '.id')
EXPIRES=$(echo "$HTTP_BODY" | jq -r '.expiresAt')
echo "Reserva criada: $RESERVATION_ID, expires_at: $EXPIRES"

echo ""
echo "=== 7. POST /payments/confirm ==="
api_parse POST "/payments/confirm" "{\"reservationId\":\"$RESERVATION_ID\"}"
[ "$HTTP_CODE" = "201" ] || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
SALE_ID=$(echo "$HTTP_BODY" | jq -r '.id')
CENTS=$(echo "$HTTP_BODY" | jq -r '.amountPaidCents')
VALOR_REAIS=$(echo "$CENTS" | awk '{printf "%.2f", $1/100}')
echo "Venda confirmada: $SALE_ID, valor: R$ $VALOR_REAIS"

echo ""
echo "=== 8. GET /payments/user/:userId/history ==="
api_parse GET "/payments/user/$USER_ID/history"
HISTORY_COUNT=$(echo "$HTTP_BODY" | jq 'length')
echo "Compras do usuario: $HISTORY_COUNT"

echo ""
echo "=== 9. Tentar reservar mesmo assento (deve falhar - ja vendido) ==="
api_parse POST "/users" "{\"name\":\"Usuario 2\",\"email\":\"user2-$RUN_ID@example.com\"}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
USER2_ID=$(echo "$HTTP_BODY" | jq -r '.id')

api_parse POST "/reservations" "{\"userId\":\"$USER2_ID\",\"sessionId\":\"$SESSION_ID\",\"seatId\":\"$SEAT_ID\"}"
if [ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "400" ]; then
  MSG=$(echo "$HTTP_BODY" | jq -r '.message // empty')
  echo "OK: assento ja vendido - ${MSG:-$HTTP_BODY}"
else
  echo "ERRO: deveria ter falhado (assento ja vendido). Codigo: $HTTP_CODE"
  exit 1
fi

echo ""
echo "=== Testes concluidos ==="
