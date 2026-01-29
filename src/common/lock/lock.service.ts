import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class LockService {
    private readonly logger = new Logger(LockService.name);
    private readonly DEFAULT_TTL = 30000; // 30 segundos conforme requisito

    constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) { }

    /**
     * Adquire um lock distribuído para um par de sessão e assento.
     * @param sessionId ID da sessão
     * @param seatId ID do assento
     * @returns Retorna a chave do lock se obtido, null caso contrário
     */
    async acquireLock(sessionId: string, seatId: string): Promise<string | null> {
        const lockKey = `lock:session:${sessionId}:seat:${seatId}`;

        // Tenta definir a chave apenas se ela não existir (NX) com um tempo de expiração (PX)
        const result = await this.redis.set(lockKey, 'locked', 'PX', this.DEFAULT_TTL, 'NX');

        if (result === 'OK') {
            this.logger.debug(`Lock obtido: ${lockKey}`);
            return lockKey;
        }

        this.logger.warn(`Falha ao obter lock (já em uso): ${lockKey}`);
        return null;
    }

    /**
     * Libera um lock.
     * @param lockKey Chave do lock
     */
    async releaseLock(lockKey: string): Promise<void> {
        await this.redis.del(lockKey);
        this.logger.debug(`Lock liberado: ${lockKey}`);
    }

    /**
     * Ordena múltiplos assentos para evitar Deadlocks.
     * Se dois usuários tentarem reservar [A1, A2] e [A2, A1] ao mesmo tempo,
     * a ordenação garante que ambos tentarão na mesma ordem (A1, depois A2),
     * fazendo com que o segundo bloqueie no primeiro lock e não cause deadlock circular.
     */
    orderSeats(seatIds: string[]): string[] {
        return [...seatIds].sort();
    }
}
