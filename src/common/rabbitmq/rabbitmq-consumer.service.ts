import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import * as amqp from 'amqplib';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service';
import { AppLoggerService } from '../logger/logger.service';
import { correlationIdStorage } from '../logger/correlation-id.storage';
import { Reservation, ReservationStatus } from '../../modules/reservations/entities/reservation.entity';
import {
  RABBITMQ_EXCHANGE,
  QUEUE_NAMES,
  ROUTING_KEYS,
  ROUTING_KEY_DLQ,
  RETRY_SUFFIX,
  RETRY_HEADER,
  MAX_RETRIES,
} from './rabbitmq.constants';

const ROUTING_KEY_BY_QUEUE: Record<string, string> = {
  [QUEUE_NAMES.RESERVATION_CREATED]: ROUTING_KEYS.RESERVATION_CREATED,
  [QUEUE_NAMES.RESERVATION_EXPIRED]: ROUTING_KEYS.RESERVATION_EXPIRED,
  [QUEUE_NAMES.PAYMENT_CONFIRMED]: ROUTING_KEYS.PAYMENT_CONFIRMED,
  [QUEUE_NAMES.SEAT_RELEASED]: ROUTING_KEYS.SEAT_RELEASED,
};

const LOG_CONTEXT = 'RabbitMQConsumerService';

@Injectable()
export class RabbitMQConsumerService implements OnModuleInit {
  constructor(
    private readonly connection: RabbitMQConnectionService,
    private readonly publisher: RabbitMQPublisherService,
    private readonly logger: AppLoggerService,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connection.getWhenReady();
    await this.startConsumers();
  }

  private async startConsumers(): Promise<void> {
    const ch = this.connection.getChannel();
    await ch.prefetch(1);

    const queues = [
      QUEUE_NAMES.RESERVATION_CREATED,
      QUEUE_NAMES.RESERVATION_EXPIRED,
      QUEUE_NAMES.PAYMENT_CONFIRMED,
      QUEUE_NAMES.SEAT_RELEASED,
    ] as const;

    for (const queueName of queues) {
      await ch.consume(queueName, (msg) => this.handleMessage(queueName, msg!), {
        noAck: false,
      });
      this.logger.log(`Consumer started for queue ${queueName}`, LOG_CONTEXT);
    }
  }

  private async handleMessage(queueName: string, msg: amqp.ConsumeMessage): Promise<void> {
    const correlationId = (msg.properties.headers?.['x-correlation-id'] as string) || randomUUID();
    correlationIdStorage.run(correlationId, async () => {
      const routingKey = ROUTING_KEY_BY_QUEUE[queueName];
      const retryCount = (msg.properties.headers?.[RETRY_HEADER] as number) ?? 0;

      try {
        const payload = JSON.parse(msg.content.toString()) as Record<string, unknown>;
        await this.dispatch(queueName, payload);
        this.connection.getChannel().ack(msg);
      } catch (err) {
        this.logger.warn(`Error processing message from ${queueName}`, LOG_CONTEXT, { err });
        this.connection.getChannel().ack(msg);
        if (retryCount < MAX_RETRIES) {
          this.publishToRetry(routingKey, msg, retryCount + 1);
        } else {
          this.publishToDlq(msg);
        }
      }
    });
  }

  private publishToRetry(routingKey: string, originalMsg: amqp.ConsumeMessage, retryCount: number): void {
    const ch = this.connection.getChannel();
    ch.publish(RABBITMQ_EXCHANGE, routingKey + RETRY_SUFFIX, originalMsg.content, {
      persistent: true,
      contentType: originalMsg.properties.contentType || 'application/json',
      headers: { ...originalMsg.properties.headers, [RETRY_HEADER]: retryCount },
    });
    this.logger.debug(`Sent to retry (${retryCount}/${MAX_RETRIES})`, LOG_CONTEXT);
  }

  private publishToDlq(msg: amqp.ConsumeMessage): void {
    const ch = this.connection.getChannel();
    ch.publish(RABBITMQ_EXCHANGE, ROUTING_KEY_DLQ, msg.content, {
      persistent: true,
      contentType: msg.properties.contentType || 'application/json',
      headers: { ...msg.properties.headers, 'x-original-routing-key': msg.fields.routingKey },
    });
    this.logger.warn('Message sent to DLQ after max retries', LOG_CONTEXT);
  }

  private async dispatch(queueName: string, payload: Record<string, unknown>): Promise<void> {
    switch (queueName) {
      case QUEUE_NAMES.RESERVATION_CREATED:
        this.logger.log(`[reservation.created] ${JSON.stringify(payload)}`, LOG_CONTEXT);
        break;
      case QUEUE_NAMES.RESERVATION_EXPIRED:
        await this.handleReservationExpired(payload);
        break;
      case QUEUE_NAMES.PAYMENT_CONFIRMED:
        this.logger.log(`[payment.confirmed] ${JSON.stringify(payload)}`, LOG_CONTEXT);
        break;
      case QUEUE_NAMES.SEAT_RELEASED:
        this.logger.log(`[seat.released] ${JSON.stringify(payload)}`, LOG_CONTEXT);
        break;
      default:
        this.logger.debug(`Unknown queue ${queueName}`, LOG_CONTEXT);
    }
  }

  /** Idempotente: só atualiza se reserva ainda estiver PENDING. Publica seat.released. */
  private async handleReservationExpired(payload: Record<string, unknown>): Promise<void> {
    const reservationId = payload.reservationId as string;
    const sessionId = payload.sessionId as string;
    const seatId = payload.seatId as string;
    if (!reservationId || !sessionId || !seatId) {
      throw new Error('Missing reservationId, sessionId or seatId');
    }
    const result = await this.reservationRepository.update(
      {
        id: reservationId,
        status: ReservationStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      { status: ReservationStatus.EXPIRED },
    );
    if (result.affected && result.affected > 0) {
      this.logger.log(`Reservation ${reservationId} marked as EXPIRED, publishing seat.released`, LOG_CONTEXT);
      this.publisher.publish('seat.released', { sessionId, seatId });
    }
  }
}
