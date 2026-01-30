import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getCorrelationId } from '../logger/correlation-id.storage';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = getCorrelationId();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as { message?: string | string[] } | string)
        : 'Internal server error';
    const body =
      typeof message === 'string'
        ? { message }
        : Array.isArray((message as { message?: string[] }).message)
          ? { message: (message as { message: string[] }).message }
          : { message: (message as { message?: string }).message ?? 'Internal server error' };

    const errorResponse = {
      statusCode: status,
      ...body,
      correlationId: correlationId ?? undefined,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
        AllExceptionsFilter.name,
      );
    }

    response.status(status).json(errorResponse);
  }
}
