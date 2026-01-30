import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import pino from 'pino';
import { getCorrelationId } from './correlation-id.storage';

const LOG_LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const pinoInstance = pino({
  level: LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }
    : {}),
});

@Injectable()
export class AppLoggerService implements NestLoggerService {
  private child(logContext: string) {
    return pinoInstance.child({ context: logContext });
  }

  private withCorrelationId(context: string, meta?: Record<string, unknown>) {
    const correlationId = getCorrelationId();
    return { context, ...(correlationId && { correlationId }), ...meta };
  }

  /** Nest LoggerService: log(message, context?) */
  log(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : 'Application';
    const meta = optionalParams.length > 1 ? (optionalParams[1] as Record<string, unknown>) : undefined;
    this.child(context).info(this.withCorrelationId(context, meta), String(message));
  }

  /** Nest LoggerService: error(message, trace?, context?) */
  error(message: unknown, trace?: string, context?: string, ...optionalParams: unknown[]) {
    const ctx = context ?? (typeof optionalParams[0] === 'string' ? optionalParams[0] : 'Application');
    this.child(ctx).error(
      { ...this.withCorrelationId(ctx), trace },
      String(message),
    );
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : 'Application';
    this.child(context).warn(this.withCorrelationId(context), String(message));
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : 'Application';
    this.child(context).debug(this.withCorrelationId(context), String(message));
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : 'Application';
    this.child(context).trace(this.withCorrelationId(context), String(message));
  }
}
