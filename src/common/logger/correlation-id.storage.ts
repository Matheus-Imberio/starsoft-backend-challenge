import { AsyncLocalStorage } from 'async_hooks';

/** Armazena o correlation ID do request ou do processamento assíncrono (ex.: mensagem RabbitMQ). */
export const correlationIdStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(): string | undefined {
  return correlationIdStorage.getStore();
}
