import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from '../../modules/reservations/entities/reservation.entity';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service';
import { RabbitMQConsumerService } from './rabbitmq-consumer.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Reservation])],
  providers: [RabbitMQConnectionService, RabbitMQPublisherService, RabbitMQConsumerService],
  exports: [RabbitMQPublisherService],
})
export class RabbitMQModule {}
