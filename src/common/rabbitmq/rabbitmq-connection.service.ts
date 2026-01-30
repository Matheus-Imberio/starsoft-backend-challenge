import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  RABBITMQ_EXCHANGE,
  QUEUE_NAMES,
  ROUTING_KEYS,
  ROUTING_KEY_DLQ,
  RETRY_SUFFIX,
  RETRY_TTL_MS,
} from './rabbitmq.constants';

@Injectable()
export class RabbitMQConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConnectionService.name);
  private channel: amqp.Channel | null = null;
  private conn: amqp.ChannelModel | null = null;
  private whenReadyPromise: Promise<void> | null = null;
  private whenReadyResolve: (() => void) | null = null;

  constructor(private readonly configService: ConfigService) {
    this.whenReadyPromise = new Promise((resolve) => {
      this.whenReadyResolve = resolve;
    });
  }

  async onModuleInit(): Promise<void> {
    const url = this.getConnectionUrl();
    try {
      this.conn = await amqp.connect(url);
      this.channel = await this.conn.createChannel();
      await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });
      await this.setupQueues();
      this.logger.log('RabbitMQ connected and queues asserted');
      this.whenReadyResolve?.();
    } catch (err) {
      this.logger.error('Failed to connect to RabbitMQ', err);
      throw err;
    }
  }

  /** Aguarda o canal estar pronto antes de iniciar consumers. */
  getWhenReady(): Promise<void> {
    return this.whenReadyPromise ?? Promise.resolve();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel) await this.channel.close();
      if (this.conn) await this.conn.close();
    } catch (err) {
      this.logger.warn('Error closing RabbitMQ connection', err);
    }
  }

  getChannel(): amqp.Channel {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    return this.channel;
  }

  private getConnectionUrl(): string {
    const user = this.configService.get<string>('RABBITMQ_USER', 'guest');
    const pass = this.configService.get<string>('RABBITMQ_PASS', 'guest');
    const host = this.configService.get<string>('RABBITMQ_HOST', 'localhost');
    const port = this.configService.get<number>('RABBITMQ_PORT', 5672);
    return `amqp://${user}:${pass}@${host}:${port}`;
  }

  private async setupQueues(): Promise<void> {
    const ch = this.channel!;

    // DLQ (recebe mensagens enviadas com routing key 'dlq')
    await ch.assertQueue(QUEUE_NAMES.DLQ, { durable: true });
    await ch.bindQueue(QUEUE_NAMES.DLQ, RABBITMQ_EXCHANGE, ROUTING_KEY_DLQ);

    const mainQueues = [
      { name: QUEUE_NAMES.RESERVATION_CREATED, key: ROUTING_KEYS.RESERVATION_CREATED },
      { name: QUEUE_NAMES.RESERVATION_EXPIRED, key: ROUTING_KEYS.RESERVATION_EXPIRED },
      { name: QUEUE_NAMES.PAYMENT_CONFIRMED, key: ROUTING_KEYS.PAYMENT_CONFIRMED },
      { name: QUEUE_NAMES.SEAT_RELEASED, key: ROUTING_KEYS.SEAT_RELEASED },
    ] as const;

    for (const { name, key } of mainQueues) {
      await ch.assertQueue(name, { durable: true });
      await ch.bindQueue(name, RABBITMQ_EXCHANGE, key);

      const retryQueue = name + RETRY_SUFFIX;
      await ch.assertQueue(retryQueue, {
        durable: true,
        arguments: {
          'x-message-ttl': RETRY_TTL_MS,
          'x-dead-letter-exchange': RABBITMQ_EXCHANGE,
          'x-dead-letter-routing-key': key,
        },
      });
      await ch.bindQueue(retryQueue, RABBITMQ_EXCHANGE, key + RETRY_SUFFIX);
    }
  }
}
