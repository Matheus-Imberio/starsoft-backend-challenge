import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Session } from './session.entity';

@Entity('seats')
@Unique(['session', 'seatNumber'])
export class Seat {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'session_id' })
    sessionId: string;

    @ManyToOne(() => Session, (session) => session.seats)
    @JoinColumn({ name: 'session_id' })
    session: Session;

    @Column({ name: 'seat_number' })
    seatNumber: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
