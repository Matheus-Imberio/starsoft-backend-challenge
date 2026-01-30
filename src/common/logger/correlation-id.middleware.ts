import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { correlationIdStorage } from './correlation-id.storage';

const HEADER_NAME = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = (req.headers[HEADER_NAME] as string) || randomUUID();
    (req as Request & { correlationId: string }).correlationId = id;
    res.setHeader(HEADER_NAME, id);
    correlationIdStorage.run(id, () => next());
  }
}
