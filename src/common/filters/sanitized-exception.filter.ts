import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Hides internal error details (Postgres/Supabase messages, stacks) from clients.
 * Logs the real message server-side.
 */
@Injectable()
@Catch()
export class SanitizedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SanitizedExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        const detail =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : JSON.stringify(exceptionResponse);
        this.logger.error(detail, exception.stack);
        response.status(status).json({
          statusCode: status,
          message: 'Erro interno do servidor.',
          error: 'Internal Server Error',
        });
        return;
      }

      response.status(status).json(
        typeof exceptionResponse === 'string'
          ? { statusCode: status, message: exceptionResponse }
          : exceptionResponse,
      );
      return;
    }

    const message =
      exception instanceof Error ? exception.message : 'Unknown error';
    this.logger.error(message, exception instanceof Error ? exception.stack : undefined);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
  }
}
