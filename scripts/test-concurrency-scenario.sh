#!/usr/bin/env bash
# Cenário de Teste Guiado (Fase 11)
# Demonstra: 2 usuários tentando reservar o mesmo assento -> apenas 1 reserva -> pagamento -> sem duplicidade
# Uso: ./scripts/test-concurrency-scenario.sh (Linux/macOS)
# Requer: curl, jq. API em http://localhost:3000. Pode ser executado varias vezes.

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

api_parse() {
  local result
  result=$(api "$@")
  HTTP_BODY=$(echo "$result" | head -n -1)
  HTTP_CODE=$(echo "$result" | tail -n 1)
}
ok() { [ "${HTTP_CODE:0:1}" = "2" ]; }

echo "========================================"
echo " CENARIO DE TESTE GUIADO - FASE 11"
echo " 2 usuarios, mesmo assento, sem duplicidade"
echo "========================================"
echo ""

echo "[1] Criar sessao 'Filme X - 19:00'..."
api_parse POST "/sessions" '{"movieTitle":"Filme X - 19:00","roomName":"Sala 1","startTime":"2026-02-01T19:00:00.000Z","priceCents":2500}'
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
SESSION_ID=$(echo "$HTTP_BODY" | jq -r '.id')
echo "    Sessao criada: $SESSION_ID"
echo ""

echo "[2] Criar 16 assentos (A1 a A16)..."
SEAT_NUMS=$(printf '"A%s",' $(seq 1 16) | sed 's/,$//')
api_parse POST "/sessions/$SESSION_ID/seats" "{\"seatNumbers\":[$SEAT_NUMS]}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
SEAT_ID=$(echo "$HTTP_BODY" | jq -r '.[0].id')
echo "    Assentos criados. Assento alvo (A1): $SEAT_ID"
echo ""

echo "[3] Criar 2 usuarios (Ana e Bruno)..."
api_parse POST "/users" "{\"name\":\"Ana\",\"email\":\"ana-$RUN_ID@test.com\"}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
USER1_ID=$(echo "$HTTP_BODY" | jq -r '.id')
api_parse POST "/users" "{\"name\":\"Bruno\",\"email\":\"bruno-$RUN_ID@test.com\"}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
USER2_ID=$(echo "$HTTP_BODY" | jq -r '.id')
echo "    Ana:  $USER1_ID"
echo "    Bruno: $USER2_ID"
echo ""

echo "[4] Ana tenta reservar o assento A1..."
api_parse POST "/reservations" "{\"userId\":\"$USER1_ID\",\"sessionId\":\"$SESSION_ID\",\"seatId\":\"$SEAT_ID\"}"
if [ "$HTTP_CODE" != "201" ]; then
  echo "    Falhou: $HTTP_BODY"
  exit 1
fi
RESERVATION_ID=$(echo "$HTTP_BODY" | jq -r '.id')
echo "    OK - Reserva criada: $RESERVATION_ID"
echo ""
echo "    Bruno tenta reservar o MESMO assento A1..."
api_parse POST "/reservations" "{\"userId\":\"$USER2_ID\",\"sessionId\":\"$SESSION_ID\",\"seatId\":\"$SEAT_ID\"}"
if [ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "    Esperado: Bruno nao consegue. Resposta: $HTTP_CODE"
else
  echo "    ERRO: Bruno obteve reserva (duplicidade!)"
  exit 1
fi

echo ""
echo "[5] Quantidade de reservas por usuario:"
api_parse GET "/reservations/user/$USER1_ID"
COUNT_ANA=$(echo "$HTTP_BODY" | jq 'if type == "array" then length else 0 end')
api_parse GET "/reservations/user/$USER2_ID"
COUNT_BRUNO=$(echo "$HTTP_BODY" | jq 'if type == "array" then length else 0 end')
echo "    Ana:  $COUNT_ANA reserva(s)"
echo "    Bruno: $COUNT_BRUNO reserva(s)"
if [ "$COUNT_ANA" = "1" ] && [ "$COUNT_BRUNO" = "0" ]; then
  echo "    Apenas 1 reserva criada (Ana). OK."
else
  echo "    Esperado: Ana=1, Bruno=0"
  exit 1
fi
echo ""

echo "[6] Ana confirma pagamento da reserva..."
api_parse POST "/payments/confirm" "{\"reservationId\":\"$RESERVATION_ID\"}"
ok || { echo "Erro $HTTP_CODE: $HTTP_BODY"; exit 1; }
SALE_ID=$(echo "$HTTP_BODY" | jq -r '.id')
CENTS=$(echo "$HTTP_BODY" | jq -r '.amountPaidCents')
VALOR_REAIS=$(echo "$CENTS" | awk '{printf "%.2f", $1/100}')
echo "    Venda confirmada: $SALE_ID, valor: R$ $VALOR_REAIS"
echo ""

echo "[7] Bruno tenta reservar o mesmo assento (ja vendido)..."
api_parse POST "/reservations" "{\"userId\":\"$USER2_ID\",\"sessionId\":\"$SESSION_ID\",\"seatId\":\"$SEAT_ID\"}"
if [ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "    Esperado: 409 - Assento ja vendido. Resposta: $HTTP_CODE"
else
  echo "    ERRO: Bruno conseguiu reservar assento ja vendido (duplicidade!)"
  exit 1
fi
echo ""

echo "[8] Historico de compras:"
api_parse GET "/payments/user/$USER1_ID/history"
H_ANA=$(echo "$HTTP_BODY" | jq 'length')
api_parse GET "/payments/user/$USER2_ID/history"
H_BRUNO=$(echo "$HTTP_BODY" | jq 'length')
echo "    Ana:  $H_ANA compra(s)"
echo "    Bruno: $H_BRUNO compra(s)"
echo ""

echo "========================================"
echo " CENARIO CONCLUIDO - SEM DUPLICIDADE"
echo "========================================"
