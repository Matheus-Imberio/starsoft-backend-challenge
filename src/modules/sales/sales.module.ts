import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { Reservation } from '../reservations/entities/reservation.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Sale, Reservation])],
    providers: [SalesService],
    controllers: [SalesController],
    exports: [SalesService],
})
export class SalesModule { }
