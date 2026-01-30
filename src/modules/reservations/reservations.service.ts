import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, MoreThan } from 'typeorm';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { LockService } from '../../common/lock/lock.service';
import { RabbitMQPublisherService } from '../../common/rabbitmq/rabbitmq-publisher.service';
import { ReservationExpirationService } from '../../common/reservation-expiration/reservation-expiration.service';
import { Sale } from '../sales/entities/sale.entity';

@Injectable()
export class ReservationsService {
    private readonly logger = new Logger(ReservationsService.name);

    constructor(
        @InjectRepository(Reservation)
        private readonly reservationRepository: Repository<Reservation>,
        @InjectRepository(Sale)
        private readonly saleRepository: Repository<Sale>,
        private readonly lockService: LockService,
        private readonly dataSource: DataSource,
        private readonly rabbitMQ: RabbitMQPublisherService,
        private readonly reservationExpiration: ReservationExpirationService,
    ) { }

    async reserve(dto: CreateReservationDto): Promise<Reservation> {
        const { sessionId, seatId, userId } = dto;

        // 1. Tentar Lock Distribuído no Redis
        const lockKey = await this.lockService.acquireLock(sessionId, seatId);
        if (!lockKey) {
            throw new ConflictException('Seat is currently being processed. Please try again.');
        }

        try {
            // 2. Verificar no Banco se já existe venda ou reserva ativa
            // Usamos uma transação para garantir que a verificação e a inserção sejam atômicas
            return await this.dataSource.transaction(async (manager) => {
                // Verificar Venda
                const existingSale = await manager.findOne(Sale, {
                    where: { sessionId, seatId },
                });
                if (existingSale) {
                    throw new ConflictException('Seat already sold');
                }

                // Verificar Reserva Ativa (não expirada e não cancelada)
                const activeReservation = await manager.findOne(Reservation, {
                    where: {
                        sessionId,
                        seatId,
                        status: ReservationStatus.PENDING,
                        expiresAt: MoreThan(new Date()),
                    },
                });

                if (activeReservation) {
                    throw new ConflictException('Seat already reserved');
                }

                // 3. Criar a Reserva
                const reservation = manager.create(Reservation, {
                    userId,
                    sessionId,
                    seatId,
                    expiresAt: new Date(Date.now() + 30000), // 30 segundos
                    status: ReservationStatus.PENDING,
                });

                const savedReservation = await manager.save(reservation);

                this.logger.log(`Reserva criada: ${savedReservation.id} para assento ${seatId}`);

                this.rabbitMQ.publish('reservation.created', {
                    reservationId: savedReservation.id,
                    userId,
                    sessionId,
                    seatId,
                    expiresAt: savedReservation.expiresAt.toISOString(),
                });

                await this.reservationExpiration.scheduleExpiration(
                    savedReservation.id,
                    sessionId,
                    seatId,
                );

                return savedReservation;
            });
        } finally {
            // 4. Liberar Lock do Redis independente do resultado
            await this.lockService.releaseLock(lockKey);
        }
    }

    async findByUserId(userId: string): Promise<Reservation[]> {
        return this.reservationRepository.find({
            where: { userId },
            relations: ['session', 'seat'],
        });
    }
}
