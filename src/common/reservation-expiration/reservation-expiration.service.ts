import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Redis } from 'ioredis';
import { RabbitMQPublisherService } from '../rabbitmq/rabbitmq-publisher.service';
import { Reservation, ReservationStatus } from '../../modules/reservations/entities/reservation.entity';
import { buildExpireKey, parseExpireKey, RESERVATION_TTL_SECONDS } from './reservation-expiration.constants';

@Injectable()
export class ReservationExpirationService {
  private readonly logger = new Logger(ReservationExpirationService.name);
  private subscriberClient: Redis | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly rabbitMQ: RabbitMQPublisherService,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.enableKeyspaceNotifications();
    await this.startExpiredKeySubscriber();
    this.startPollingFallback();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    if (this.subscriberClient) await this.subscriberClient.quit();
  }

  /**
   * Chama após criar uma reserva: define chave no Redis com TTL 30s.
   * Quando a chave expirar, o subscriber publica reservation.expired.
   */
  async scheduleExpiration(reservationId: string, sessionId: string, seatId: string): Promise<void> {
    const key = buildExpireKey(reservationId, sessionId, seatId);
    await this.redis.setex(key, RESERVATION_TTL_SECONDS, '1');
    this.logger.debug(`Expiration scheduled: ${key} TTL=${RESERVATION_TTL_SECONDS}s`);
  }

  private async enableKeyspaceNotifications(): Promise<void> {
    try {
      await this.redis.config('SET', 'notify-keyspace-events', 'Ex');
      this.logger.log('Redis keyspace notifications enabled (Ex)');
    } catch (err) {
      this.logger.warn(
        'Could not enable Redis keyspace notifications (CONFIG SET). Expiration will use DB polling fallback.',
        err,
      );
    }
  }

  private async startExpiredKeySubscriber(): Promise<void> {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    this.subscriberClient = new Redis({ host, port });
    this.subscriberClient.on('error', (err) => this.logger.error('Expiration subscriber Redis error', err));

    this.subscriberClient.on('pmessage', (_pattern: string, _channel: string, key: string) => {
      const parsed = parseExpireKey(key);
      if (!parsed) return;
      this.logger.log(`Reservation TTL expired (Redis): ${parsed.reservationId}, publishing reservation.expired`);
      this.rabbitMQ.publish('reservation.expired', {
        reservationId: parsed.reservationId,
        sessionId: parsed.sessionId,
        seatId: parsed.seatId,
      });
    });

    await this.subscriberClient.psubscribe('__keyevent@0__:expired');
    this.logger.log('Subscribed to Redis keyevent@0:expired');
  }

  /** Fallback: a cada 10s busca reservas PENDING com expiresAt < now e publica reservation.expired. */
  private startPollingFallback(): void {
    this.pollingInterval = setInterval(() => this.publishExpiredReservations(), 10_000);
    this.logger.log('Expiration polling fallback started (every 10s)');
  }

  private async publishExpiredReservations(): Promise<void> {
    const now = new Date();
    const expired = await this.reservationRepository.find({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: LessThan(now),
      },
      select: ['id', 'sessionId', 'seatId'],
    });
    for (const r of expired) {
      this.logger.log(`Polling: publishing reservation.expired for ${r.id}`);
      this.rabbitMQ.publish('reservation.expired', {
        reservationId: r.id,
        sessionId: r.sessionId,
        seatId: r.seatId,
      });
    }
  }
}
