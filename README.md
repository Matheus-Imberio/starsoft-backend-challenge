# Cinema API — Venda de Ingressos

API REST para venda de ingressos de cinema com **controle de concorrência** (Redis + PostgreSQL), reservas de 30s, mensageria (RabbitMQ), logging estruturado e documentação Swagger.

---

## Índice

- [Começando (3 passos)](#começando-3-passos)
- [O que é este projeto](#o-que-é-este-projeto)
- [Como executar](#como-executar)
- [Popular dados e testar](#popular-dados-e-testar)
- [Endpoints da API](#endpoints-da-api)
- [Tecnologias](#tecnologias-escolhidas)
- [Concorrência e fluxo](#estratégias-de-concorrência)
- [Edge cases, limitações e melhorias](#edge-cases-limitações-e-melhorias)
- [Scripts do projeto](#scripts-do-projeto)

---

## Começando (3 passos)

**1.** Crie o arquivo `.env` na raiz do projeto (copie o conteúdo da seção [Como executar](#como-executar)).

**2.** No terminal, na pasta do projeto:

```bash
npm install
docker compose up --build -d
```

**3.** Quando aparecer `Application listening on port 3000`:

- **API:** http://localhost:3000  
- **Documentação interativa (Swagger):** http://localhost:3000/api-docs  

Tudo sobe com um único comando; você já pode criar sessões, assentos, reservar e pagar pela API ou pelo Swagger.

---

## O que é este projeto

Sistema de **reserva e venda de ingressos** que garante:

| Garantia | Como |
|----------|------|
| **Um assento = uma reserva ou venda** | Lock no Redis + transação no PostgreSQL |
| **Reservas expiram em 30 segundos** | Redis TTL + eventos RabbitMQ |
| **Eventos de domínio** | RabbitMQ: `reservation.created`, `reservation.expired`, `payment.confirmed`, `seat.released` (com retry e DLQ) |
| **Várias instâncias da API** | Redis e PostgreSQL compartilhados; correlation ID nos logs e mensagens |

**Funcionalidades:** criar sessões e assentos, reservar assento(s), confirmar pagamento, consultar disponibilidade e histórico de compras.

---

## Como executar

Tudo roda com **Docker Compose**: um único comando sobe **API + PostgreSQL + Redis + RabbitMQ**.

### Pré-requisitos

- **Docker** e **Docker Compose**

### Passos

1. Na raiz do projeto, crie o arquivo **`.env`**:

```env
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=admin_password
DB_DATABASE=cinema_db

REDIS_HOST=redis
REDIS_PORT=6379

RABBITMQ_USER=guest
RABBITMQ_PASS=guest
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672

PORT=3000
NODE_ENV=development
```

2. Execute:

```bash
npm install
docker compose up --build -d
```

3. Aguarde a mensagem **"Application listening on port 3000"**. A API estará em http://localhost:3000.

### URLs úteis

| Recurso | URL |
|---------|-----|
| API | http://localhost:3000 |
| Swagger (documentação) | http://localhost:3000/api-docs |
| RabbitMQ Management | http://localhost:15672 (usuário: `guest`, senha: `guest`) |

---

## Popular dados e testar

O banco sobe com o schema pronto (`infra/postgres/init.sql`). Não há seed; usuários, sessões e assentos são criados pela API.

### Scripts de teste

Execute **na pasta raiz do projeto**, com a API rodando em http://localhost:3000:

| Script | O que faz |
|--------|-----------|
| test-api | Fluxo completo: criar usuário, sessão, 16 assentos, reservar, pagar, histórico e tentativa de reservar assento já vendido. |
| test-concurrency-scenario | **Cenário guiado:** 2 usuários (Ana e Bruno) tentam o mesmo assento → só 1 reserva; confirma pagamento; prova que não há duplicidade. |

Ao final do cenário de concorrência deve aparecer: **CENARIO CONCLUIDO - SEM DUPLICIDADE**.

**Linux / macOS (bash):**  
Requer apenas `curl` e `jq` (ex.: `apt install curl jq` ou `brew install curl jq`). Na pasta raiz do projeto:
```bash
chmod +x scripts/test-api.sh scripts/test-concurrency-scenario.sh
./scripts/test-api.sh
./scripts/test-concurrency-scenario.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\test-api.ps1
.\scripts\test-concurrency-scenario.ps1
```

**Como garantir que os scripts bash funcionam**

- **CI (GitHub Actions):** O workflow `.github/workflows/test-scripts.yml` roda em cada push/PR nas branches `main`, `master` ou `staging`. Ele sobe a stack com `docker compose up`, aguarda a API ficar pronta e executa `./scripts/test-api.sh` e `./scripts/test-concurrency-scenario.sh` no Linux. Se algum script falhar, o job falha.
- **Local (Linux ou WSL):** Com a API rodando (ex.: `docker compose up --build`), na pasta raiz: `chmod +x scripts/*.sh` e depois `./scripts/test-api.sh` e `./scripts/test-concurrency-scenario.sh`. Requer `curl` e `jq` instalados.

### Passo a passo manual (via API ou Swagger)

1. **POST /users** — Criar usuário (`name`, `email`). Guardar o `id`.
2. **POST /sessions** — Criar sessão (ex.: "Filme X - 19:00", sala, horário, `priceCents`). Guardar o `id`.
3. **POST /sessions/:id/seats** — Body: `{ "seatNumbers": ["A1", "A2", ..., "A16"] }`. Guardar pelo menos um `id` de assento.
4. **POST /reservations** — Body: `{ "userId", "sessionId", "seatId" }`. Retorna reserva com `expires_at` (30s).
5. **POST /payments/confirm** — Body: `{ "reservationId" }`. Converte reserva em venda.
6. **GET /payments/user/:userId/history** — Histórico de compras do usuário.

Documentação completa em **http://localhost:3000/api-docs**.

---

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | / | Health |
| POST | /users | Criar usuário |
| POST | /sessions | Criar sessão |
| POST | /sessions/:id/seats | Adicionar assentos (mín. 16) |
| GET | /sessions/:id/availability | Listar assentos da sessão |
| POST | /reservations | Reservar assento (30s) |
| GET | /reservations/user/:userId | Reservas do usuário |
| POST | /payments/confirm | Confirmar pagamento |
| GET | /payments/user/:userId/history | Histórico de compras |

**Swagger:** http://localhost:3000/api-docs

---

## Tecnologias escolhidas

| Tecnologia | Uso | Justificativa |
|------------|-----|---------------|
| **PostgreSQL** | Persistência (users, sessions, seats, reservations, sales) | Transações ACID; `UNIQUE(session_id, seat_id)` em `sales` evita venda duplicada. |
| **Redis** | Lock por (session_id, seat_id) com TTL 30s; TTL de expiração de reserva; keyspace notifications | Lock atômico (`SET NX PX`) entre instâncias; fallback com polling a cada 10s. |
| **RabbitMQ** | Eventos: reservation.created/expired, payment.confirmed, seat.released; DLQ e retry | Desacoplamento; ACK manual; retry com backoff; correlation ID. |
| **NestJS** | API, módulos, DTOs, validação, Swagger, Throttler, filtros | Estrutura clara; integração com TypeORM, Pino, etc. |
| **TypeORM** | Entidades e transações | Schema alinhado ao `init.sql`; transações na reserva e no pagamento. |
| **Pino** | Logging (DEBUG, INFO, WARN, ERROR); correlation ID por request e por mensagem | Performance; formato adequado para agregadores. |
| **class-validator** | Validação de DTOs | ValidationPipe global (whitelist, forbidNonWhitelisted). |

---

## Estratégias de concorrência

- **Lock no Redis:** chave `lock:session:{sessionId}:seat:{seatId}`, comando `SET NX PX 30000`. Quem não obtém o lock recebe 409. Lock liberado no `finally` (DEL).
- **Transação no PostgreSQL:** verificação de venda/reserva ativa + inserção da reserva numa única transação; evita duas reservas para o mesmo assento.
- **Constraint:** `UNIQUE(session_id, seat_id)` em `sales` — segunda venda para o mesmo assento falha (409).
- **Ordenação de assentos:** para múltiplos assentos, IDs ordenados antes dos locks (evita deadlock entre dois usuários reservando [A1,A2] e [A2,A1]).
- **Múltiplas instâncias:** Redis e PostgreSQL compartilhados; correlation ID nos logs e nas mensagens RabbitMQ.

### Fluxo resumido da reserva

1. Request `POST /reservations` → tenta lock Redis (sessionId, seatId).
2. Se lock OK: dentro de transação verifica venda e reserva ativa; insere reserva (expires_at = now + 30s); publica `reservation.created`; agenda expiração no Redis (`SETEX` 30s); commit.
3. Após 30s: Redis expira a chave → subscriber publica `reservation.expired` (ou polling a cada 10s) → consumer marca reserva como EXPIRED e publica `seat.released`.
4. Pagamento: `POST /payments/confirm` valida reserva PENDING e não expirada; insere em `sales`; atualiza reserva para COMPLETED; publica `payment.confirmed`.

---

## Edge cases, limitações e melhorias

### Edge cases tratados

| Cenário | Tratamento |
|--------|------------|
| Dois usuários no mesmo assento | Lock Redis: um obtém, outro recebe 409; transação garante uma reserva. |
| Email duplicado (POST /users) | Constraint UNIQUE; 409 com mensagem "A user with this email already exists". |
| Reserva expirada no pagamento | Validação de `expires_at` e status; 400 e marca EXPIRED. |
| Pagamento duplicado (mesma reserva) | Status deixa de ser PENDING; segunda chamada retorna 400. |
| Assento já vendido | Constraint UNIQUE; 409. |
| Processo morre com lock | TTL 30s no Redis; lock expira. |
| Falha no consumer RabbitMQ | Retry com backoff; DLQ após N tentativas. |
| Redis sem keyspace notifications | Polling a cada 10s publica `reservation.expired`. |
| Payload inválido | ValidationPipe → 400. |
| Muitas requisições | ThrottlerGuard (ex.: 10 req/s, 100 req/min). |

### Limitações conhecidas

- Um assento por request no `POST /reservations`; múltiplos assentos = várias chamadas (ordenação para deadlock já existe no `LockService.orderSeats`).
- Sem autenticação; o cliente envia `userId` (UUID).
- `GET /sessions/:id/availability` retorna lista de assentos sem status “vendido/reservado” por assento.
- Sem idempotency key no `POST /payments/confirm`.

---

## Scripts do projeto

| Comando | Descrição |
|---------|-----------|
| `docker compose up --build` | Sobe toda a aplicação (API + Postgres + Redis + RabbitMQ) |
| `npm run test` | Testes unitários (Jest) |
| `npm run build` | Build de produção (ex.: para imagem Docker) |
| `./scripts/test-api.sh` | Teste completo da API (Linux/macOS; requer curl e jq) |
| `./scripts/test-concurrency-scenario.sh` | Cenário guiado (Linux/macOS) |
| `.\scripts\test-api.ps1` | Teste completo da API (Windows PowerShell) |
| `.\scripts\test-concurrency-scenario.ps1` | Cenário guiado (Windows PowerShell) |

---
