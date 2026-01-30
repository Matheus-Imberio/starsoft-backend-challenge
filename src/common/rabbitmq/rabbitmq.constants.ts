/** Exchange e routing keys para eventos de domínio */
export const RABBITMQ_EXCHANGE = 'cinema.events';

export const ROUTING_KEYS = {
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_EXPIRED: 'reservation.expired',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  SEAT_RELEASED: 'seat.released',
} as const;

export const QUEUE_NAMES = {
  RESERVATION_CREATED: 'cinema.reservation.created',
  RESERVATION_EXPIRED: 'cinema.reservation.expired',
  PAYMENT_CONFIRMED: 'cinema.payment.confirmed',
  SEAT_RELEASED: 'cinema.seat.released',
  DLQ: 'cinema.dlq',
} as const;

export const ROUTING_KEY_DLQ = 'dlq';

export const RETRY_SUFFIX = '.retry';
export const RETRY_TTL_MS = 5000;
export const MAX_RETRIES = 3;
export const RETRY_HEADER = 'x-retry-count';
