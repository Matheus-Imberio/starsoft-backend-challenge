/** Prefixo da chave Redis para TTL de expiração de reserva (30s). Ao expirar, publicamos reservation.expired. */
export const RESERVATION_EXPIRE_KEY_PREFIX = 'reservation:expire:';
export const RESERVATION_TTL_SECONDS = 30;

/** Monta a chave Redis: reservation:expire:{reservationId}:{sessionId}:{seatId} */
export function buildExpireKey(reservationId: string, sessionId: string, seatId: string): string {
  return `${RESERVATION_EXPIRE_KEY_PREFIX}${reservationId}:${sessionId}:${seatId}`;
}

/** Extrai reservationId, sessionId e seatId da chave expirada. Retorna null se formato inválido. */
export function parseExpireKey(key: string): { reservationId: string; sessionId: string; seatId: string } | null {
  if (!key.startsWith(RESERVATION_EXPIRE_KEY_PREFIX)) return null;
  const parts = key.slice(RESERVATION_EXPIRE_KEY_PREFIX.length).split(':');
  if (parts.length !== 3) return null;
  return { reservationId: parts[0], sessionId: parts[1], seatId: parts[2] };
}
