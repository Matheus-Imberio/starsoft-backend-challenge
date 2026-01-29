-- Criação do Schema Inicial para o Sistema de Cinema

-- 1. Tabela de Usuários (Simplificada para o desafio)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Sessões (Filme, Sala, Horário)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movie_title VARCHAR(255) NOT NULL,
    room_name VARCHAR(100) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    price_cents INTEGER NOT NULL, -- Preço em centavos para evitar problemas de float
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Assentos (Referência física/lógica do assento na sessão)
CREATE TABLE IF NOT EXISTS seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seat_number VARCHAR(10) NOT NULL, -- Ex: A1, B10
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, seat_number)
);

-- 4. Tabela de Reservas (Temporárias - 30 segundos)
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id UUID NOT NULL REFERENCES sessions(id),
    seat_id UUID NOT NULL REFERENCES seats(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, EXPIRED, CANCELLED
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabela de Vendas (Definitivas)
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID UNIQUE REFERENCES reservations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id UUID NOT NULL REFERENCES sessions(id),
    seat_id UUID NOT NULL REFERENCES seats(id),
    amount_paid_cents INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- GARANTIA DE INTEGRIDADE: Um assento não pode ser vendido duas vezes na mesma sessão
    UNIQUE(session_id, seat_id)
);

-- Índices para performance
CREATE INDEX idx_reservations_expires_at ON reservations(expires_at) WHERE status = 'PENDING';
CREATE INDEX idx_seats_session ON seats(session_id);
CREATE INDEX idx_reservations_user ON reservations(user_id);
CREATE INDEX idx_sales_user ON sales(user_id);
