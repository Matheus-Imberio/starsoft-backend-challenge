import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from './entities/reservation.entity';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { LockModule } from '../../common/lock/lock.module';
import { Sale } from '../sales/entities/sale.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Reservation, Sale]),
        LockModule,
    ],
    providers: [ReservationsService],
    controllers: [ReservationsController],
    exports: [ReservationsService],
})
export class ReservationsModule { }
