import { Injectable } from '@nestjs/common';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { AppLoggerService } from '../logger/logger.service';
import { getCorrelationId } from '../logger/correlation-id.storage';
import { RABBITMQ_EXCHANGE, ROUTING_KEYS } from './rabbitmq.constants';

export type DomainEvent =
  | 'reservation.created'
  | 'reservation.expired'
  | 'payment.confirmed'
  | 'seat.released';

const ROUTING_KEY_MAP: Record<DomainEvent, string> = {
  'reservation.created': ROUTING_KEYS.RESERVATION_CREATED,
  'reservation.expired': ROUTING_KEYS.RESERVATION_EXPIRED,
  'payment.confirmed': ROUTING_KEYS.PAYMENT_CONFIRMED,
  'seat.released': ROUTING_KEYS.SEAT_RELEASED,
};

const LOG_CONTEXT = 'RabbitMQPublisherService';

@Injectable()
export class RabbitMQPublisherService {
  constructor(
    private readonly connection: RabbitMQConnectionService,
    private readonly logger: AppLoggerService,
  ) {}

  publish(event: DomainEvent, payload: Record<string, unknown>): void {
    const channel = this.connection.getChannel();
    const routingKey = ROUTING_KEY_MAP[event];
    const content = Buffer.from(JSON.stringify(payload));
    const correlationId = getCorrelationId();
    channel.publish(RABBITMQ_EXCHANGE, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
      headers: { ...(correlationId && { 'x-correlation-id': correlationId }) },
    });
    this.logger.debug(`Published ${event}`, LOG_CONTEXT, { payload });
  }
}
