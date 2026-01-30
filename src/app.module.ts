import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppLoggerModule } from './common/logger/logger.module';
import { CorrelationIdMiddleware } from './common/logger/correlation-id.middleware';
import { RedisModule } from './common/redis/redis.module';
import { LockModule } from './common/lock/lock.module';
import { RabbitMQModule } from './common/rabbitmq/rabbitmq.module';
import { ReservationExpirationModule } from './common/reservation-expiration/reservation-expiration.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    AppLoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      // .env.local (se existir) sobrescreve .env — use para API rodando fora do Docker (localhost)
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false, // Usaremos o init.sql para o schema inicial
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    LockModule,
    RabbitMQModule,
    ReservationExpirationModule,
    UsersModule,
    SessionsModule,
    ReservationsModule,
    SalesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
