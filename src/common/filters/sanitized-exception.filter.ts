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
import * as Sentry from '@sentry/nestjs';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import { sanitizeApiPath } from '../utils/sanitize-path.util';

/**
 * Hides internal error details (Postgres/Supabase messages, stacks) from clients.
 * Logs the real message server-side and reports 5xx errors to Sentry with tenant context.
 */
@Injectable()
@Catch()
export class SanitizedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SanitizedExceptionFilter.name);

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
        : undefined) ||
      (typeof request?.headers?.['x-tenant-id'] === 'string'
        ? request.headers['x-tenant-id']
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

        this.reportToSentry(exception, { path, method, tenantId, userId });

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
    this.logger.error(
      message,
      exception instanceof Error ? exception.stack : undefined,
    );

    this.reportToSentry(exception, { path, method, tenantId, userId });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
  }

  private reportToSentry(
    exception: unknown,
    context: {
      path: string;
      method: string;
      tenantId?: string;
      userId?: string;
    },
  ): void {
    try {
      Sentry.withScope((scope) => {
        scope.setTag('path', context.path);
        scope.setTag('method', context.method);
        if (context.tenantId) {
          scope.setTag('tenant_id', context.tenantId);
        }
        if (context.userId) {
          scope.setUser({ id: context.userId });
        }
        Sentry.captureException(exception);
      });
    } catch {
      // Silencioso para nunca interromper a resposta HTTP
    }
  }
}
