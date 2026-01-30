import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Seat } from './seat.entity';

@Entity('sessions')
export class Session {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'movie_title' })
    movieTitle: string;

    @Column({ name: 'room_name' })
    roomName: string;

    @Column({ name: 'start_time', type: 'timestamp with time zone' })
    startTime: Date;

    @Column({ name: 'price_cents' })
    priceCents: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @OneToMany(() => Seat, (seat) => seat.session)
    seats: Seat[];
}
