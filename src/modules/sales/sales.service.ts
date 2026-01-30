import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { Reservation, ReservationStatus } from '../reservations/entities/reservation.entity';
import { Session } from '../sessions/entities/session.entity';
import { RabbitMQPublisherService } from '../../common/rabbitmq/rabbitmq-publisher.service';

@Injectable()
export class SalesService {
    private readonly logger = new Logger(SalesService.name);

    constructor(
        @InjectRepository(Sale)
        private readonly saleRepository: Repository<Sale>,
        @InjectRepository(Reservation)
        private readonly reservationRepository: Repository<Reservation>,
        private readonly dataSource: DataSource,
        private readonly rabbitMQ: RabbitMQPublisherService,
    ) { }

    async confirmPayment(dto: ConfirmPaymentDto): Promise<Sale> {
        const { reservationId } = dto;

        return await this.dataSource.transaction(async (manager) => {
            // 1. Buscar a reserva e garantir que ainda é válida
            const reservation = await manager.findOne(Reservation, {
                where: { id: reservationId },
                relations: ['session'],
            });

            if (!reservation) {
                throw new NotFoundException('Reservation not found');
            }

            if (reservation.status !== ReservationStatus.PENDING) {
                throw new BadRequestException(`Reservation is already ${reservation.status}`);
            }

            const now = new Date();
            if (reservation.expiresAt < now) {
                reservation.status = ReservationStatus.EXPIRED;
                await manager.save(reservation);
                throw new BadRequestException('Reservation has expired');
            }

            // 2. Criar a Venda
            const sale = manager.create(Sale, {
                reservationId: reservation.id,
                userId: reservation.userId,
                sessionId: reservation.sessionId,
                seatId: reservation.seatId,
                amountPaidCents: reservation.session.priceCents,
            });

            // 3. Atualizar status da reserva
            reservation.status = ReservationStatus.COMPLETED;
            await manager.save(reservation);

            try {
                const savedSale = await manager.save(sale);
                this.logger.log(`Venda confirmada: ${savedSale.id} para reserva ${reservationId}`);

                this.rabbitMQ.publish('payment.confirmed', {
                    saleId: savedSale.id,
                    reservationId,
                    userId: reservation.userId,
                    sessionId: reservation.sessionId,
                    seatId: reservation.seatId,
                });

                return savedSale;
            } catch (error) {
                if (error.code === '23505') {
                    throw new ConflictException('This seat has already been sold');
                }
                throw error;
            }
        });
    }

    async findByUserId(userId: string): Promise<Sale[]> {
        return this.saleRepository.find({
            where: { userId },
            relations: ['session', 'seat'],
        });
    }
}
