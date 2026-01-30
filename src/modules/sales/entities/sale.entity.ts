import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToOne, Unique } from 'typeorm';
import { Reservation } from '../../reservations/entities/reservation.entity';
import { User } from '../../users/entities/user.entity';
import { Session } from '../../sessions/entities/session.entity';
import { Seat } from '../../sessions/entities/seat.entity';

@Entity('sales')
@Unique(['sessionId', 'seatId'])
export class Sale {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'reservation_id' })
    reservationId: string;

    @OneToOne(() => Reservation)
    @JoinColumn({ name: 'reservation_id' })
    reservation: Reservation;

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

    @Column({ name: 'amount_paid_cents' })
    amountPaidCents: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
