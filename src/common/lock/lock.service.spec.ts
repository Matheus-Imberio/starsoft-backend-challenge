import { Test, TestingModule } from '@nestjs/testing';
import { LockService } from './lock.service';

describe('LockService', () => {
  let service: LockService;
  let redisSet: jest.Mock;
  let redisDel: jest.Mock;

  beforeEach(async () => {
    redisSet = jest.fn();
    redisDel = jest.fn().mockResolvedValue(1);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LockService,
        {
          provide: 'REDIS_CLIENT',
          useValue: {
            set: redisSet,
            del: redisDel,
          },
        },
      ],
    }).compile();

    service = module.get<LockService>(LockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('acquireLock', () => {
    it('should return lock key when Redis SET NX returns OK', async () => {
      redisSet.mockResolvedValue('OK');
      const sessionId = 'session-1';
      const seatId = 'seat-1';
      const key = await service.acquireLock(sessionId, seatId);
      expect(key).toBe(`lock:session:${sessionId}:seat:${seatId}`);
      expect(redisSet).toHaveBeenCalledWith(
        key,
        'locked',
        'PX',
        30000,
        'NX',
      );
    });

    it('should return null when lock already held (SET NX fails)', async () => {
      redisSet.mockResolvedValue(null);
      const key = await service.acquireLock('session-1', 'seat-1');
      expect(key).toBeNull();
    });
  });

  describe('releaseLock', () => {
    it('should call Redis DEL with lock key', async () => {
      const lockKey = 'lock:session:s1:seat:s2';
      await service.releaseLock(lockKey);
      expect(redisDel).toHaveBeenCalledWith(lockKey);
    });
  });

  describe('orderSeats', () => {
    it('should return sorted seat ids to avoid deadlock', () => {
      const unsorted = ['A3', 'A1', 'A2'];
      const sorted = service.orderSeats(unsorted);
      expect(sorted).toEqual(['A1', 'A2', 'A3']);
      expect(unsorted).toEqual(['A3', 'A1', 'A2']);
    });

    it('should not mutate original array', () => {
      const original = ['B2', 'B1'];
      service.orderSeats(original);
      expect(original).toEqual(['B2', 'B1']);
    });
  });
});
