import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReservationsService } from './reservations.service';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { Sale } from '../sales/entities/sale.entity';
import { LockService } from '../../common/lock/lock.service';
import { RabbitMQPublisherService } from '../../common/rabbitmq/rabbitmq-publisher.service';
import { ReservationExpirationService } from '../../common/reservation-expiration/reservation-expiration.service';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let lockService: LockService;
  let dataSource: DataSource;
  let rabbitMQ: RabbitMQPublisherService;
  let reservationExpiration: ReservationExpirationService;

  const mockReservationRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSaleRepo = {
    findOne: jest.fn(),
  };

  const mockTransaction = jest.fn((cb) => cb({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  }));

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockDataSource = {
      transaction: mockTransaction,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getRepositoryToken(Reservation), useValue: mockReservationRepo },
        { provide: getRepositoryToken(Sale), useValue: mockSaleRepo },
        {
          provide: LockService,
          useValue: {
            acquireLock: jest.fn().mockResolvedValue('lock:session:s1:seat:seat1'),
            releaseLock: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: RabbitMQPublisherService,
          useValue: { publish: jest.fn() },
        },
        {
          provide: ReservationExpirationService,
          useValue: { scheduleExpiration: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
    lockService = module.get<LockService>(LockService);
    dataSource = module.get<DataSource>(DataSource);
    rabbitMQ = module.get<RabbitMQPublisherService>(RabbitMQPublisherService);
    reservationExpiration = module.get<ReservationExpirationService>(ReservationExpirationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reserve', () => {
    it('should throw ConflictException when lock cannot be acquired', async () => {
      jest.spyOn(lockService, 'acquireLock').mockResolvedValue(null);
      const dto = {
        userId: 'user-1',
        sessionId: 'session-1',
        seatId: 'seat-1',
      };
      await expect(service.reserve(dto)).rejects.toThrow(ConflictException);
      await expect(service.reserve(dto)).rejects.toThrow(
        'Seat is currently being processed',
      );
    });

    it('should create reservation and call publish + scheduleExpiration when lock acquired', async () => {
      const savedReservation = {
        id: 'res-1',
        userId: 'user-1',
        sessionId: 'session-1',
        seatId: 'seat-1',
        status: ReservationStatus.PENDING,
        expiresAt: new Date(Date.now() + 30000),
        createdAt: new Date(),
      };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn((_: unknown, data: Record<string, unknown>) => ({ ...data, id: savedReservation.id })),
        save: jest.fn().mockResolvedValue(savedReservation),
      };
      mockTransaction.mockImplementation((cb: (m: typeof manager) => Promise<unknown>) => cb(manager));

      const dto = {
        userId: 'user-1',
        sessionId: 'session-1',
        seatId: 'seat-1',
      };
      const result = await service.reserve(dto);

      expect(result).toEqual(savedReservation);
      expect(rabbitMQ.publish).toHaveBeenCalledWith('reservation.created', expect.objectContaining({
        reservationId: savedReservation.id,
        userId: dto.userId,
        sessionId: dto.sessionId,
        seatId: dto.seatId,
      }));
      expect(reservationExpiration.scheduleExpiration).toHaveBeenCalledWith(
        savedReservation.id,
        dto.sessionId,
        dto.seatId,
      );
    });
  });
});
