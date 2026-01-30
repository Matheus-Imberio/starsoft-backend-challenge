import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from '../../modules/reservations/entities/reservation.entity';
import { ReservationExpirationService } from './reservation-expiration.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Reservation])],
  providers: [ReservationExpirationService],
  exports: [ReservationExpirationService],
})
export class ReservationExpirationModule {}
