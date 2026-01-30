import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Session } from '../../sessions/entities/session.entity';
import { Seat } from '../../sessions/entities/seat.entity';

export enum ReservationStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED',
}

@Entity('reservations')
export class Reservation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'session_id' })
    sessionId: string;

    @ManyToOne(() => Session)
    @JoinColumn({ name: 'session_id' })
    session: Session;

    @Column({ name: 'seat_id' })
    seatId: string;

    @ManyToOne(() => Seat)
    @JoinColumn({ name: 'seat_id' })
    seat: Seat;

    @Column({
        type: 'varchar',
        length: 20,
        default: ReservationStatus.PENDING,
    })
    status: ReservationStatus;

    @Column({ name: 'expires_at', type: 'timestamp with time zone' })
    expiresAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
