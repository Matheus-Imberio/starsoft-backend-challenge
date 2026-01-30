import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Session } from './entities/session.entity';
import { Seat } from './entities/seat.entity';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionsService {
    constructor(
        @InjectRepository(Session)
        private readonly sessionRepository: Repository<Session>,
        @InjectRepository(Seat)
        private readonly seatRepository: Repository<Seat>,
        private readonly dataSource: DataSource,
    ) { }

    async create(createSessionDto: CreateSessionDto): Promise<Session> {
        const session = this.sessionRepository.create(createSessionDto);
        return this.sessionRepository.save(session);
    }

    async addSeats(sessionId: string, seatNumbers: string[]): Promise<Seat[]> {
        const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
        if (!session) {
            throw new NotFoundException('Session not found');
        }

        const seats = seatNumbers.map((seatNumber) =>
            this.seatRepository.create({
                sessionId,
                seatNumber,
            }),
        );

        try {
            return await this.seatRepository.save(seats);
        } catch (error) {
            if (error.code === '23505') {
                throw new ConflictException('One or more seats already exist for this session');
            }
            throw error;
        }
    }

    async getAvailability(sessionId: string) {
        // Busca todos os assentos da sessão e verifica se há venda confirmada ou reserva ativa
        // Por simplicidade neste MVP, vamos retornar todos e o status
        const seats = await this.seatRepository.find({
            where: { sessionId },
        });

        // Query mais complexa seria necessária para ver disponibilidade real em tempo real
        // combinando com a tabela de reservas e sales.
        return seats;
    }

    async findOne(id: string): Promise<Session> {
        const session = await this.sessionRepository.findOne({ where: { id } });
        if (!session) {
            throw new NotFoundException('Session not found');
        }
        return session;
    }
}
