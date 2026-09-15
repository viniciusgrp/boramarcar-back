import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import { ApiErrorEventsService } from '../api-errors/api-error-events.service';
import {
  extractExceptionMessage,
  extractExceptionName,
  extractExceptionStack,
} from '../api-errors/api-error-event.util';
import { sanitizeApiPath } from '../utils/sanitize-path.util';

/**
 * Hides internal error details (Postgres/Supabase messages, stacks) from clients.
 * Logs the real message server-side and persists 5xx errors in api_error_events.
 */
@Injectable()
@Catch()
export class SanitizedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SanitizedExceptionFilter.name);

  constructor(
    @Optional()
    private readonly apiErrorEventsService?: ApiErrorEventsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    const path = sanitizeApiPath(request?.originalUrl || request?.url);
    const method = request?.method || 'unknown';
    const tenantId =
      request?.tenantAccess?.tenant?.id ||
      (typeof request?.params?.tenantId === 'string'
        ? request.params.tenantId
        : undefined);
    const userId = request?.user?.id;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        const detail =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : JSON.stringify(exceptionResponse);
        this.logger.error(detail, exception.stack);

        this.persistError(exception, {
          path,
          method,
          tenantId,
          userId,
          statusCode: status,
        });

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

    const message = extractExceptionMessage(exception);
    this.logger.error(
      message,
      exception instanceof Error ? exception.stack : undefined,
    );

    this.persistError(exception, {
      path,
      method,
      tenantId,
      userId,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
  }

  private persistError(
    exception: unknown,
    context: {
      path: string;
      method: string;
      tenantId?: string;
      userId?: string;
      statusCode: number;
    },
  ): void {
    if (!this.apiErrorEventsService) {
      return;
    }

    void this.apiErrorEventsService
      .record({
        tenantId: context.tenantId,
        userId: context.userId,
        method: context.method,
        path: context.path,
        statusCode: context.statusCode,
        exceptionName: extractExceptionName(exception),
        message: extractExceptionMessage(exception),
        stack: extractExceptionStack(exception),
      })
      .catch(() => undefined);
  }
}
