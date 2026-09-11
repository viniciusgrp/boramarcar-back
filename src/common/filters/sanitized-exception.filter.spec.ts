import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SanitizedExceptionFilter } from './sanitized-exception.filter';

jest.mock('@sentry/nestjs', () => {
  return {
    withScope: jest.fn((callback) => {
      const scope = {
        setTag: jest.fn(),
        setUser: jest.fn(),
      };
      callback(scope);
      return scope;
    }),
    captureException: jest.fn(),
  };
});

describe('SanitizedExceptionFilter', () => {
  let filter: SanitizedExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new SanitizedExceptionFilter();
  });

  const createMockHost = (req: Record<string, unknown> = {}) => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const getResponse = jest.fn().mockReturnValue({ status: statusMock, json: jsonMock });
    const getRequest = jest.fn().mockReturnValue(req);

    const host = {
      switchToHttp: () => ({
        getResponse,
        getRequest,
      }),
    } as unknown as ArgumentsHost;

    return { host, statusMock, jsonMock };
  };

  it('should pass through 400 errors without calling Sentry', () => {
    const { host, statusMock, jsonMock } = createMockHost({
      url: '/appointments',
      method: 'POST',
    });

    const exception = new HttpException('Dados invalidos', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Dados invalidos',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should sanitize 500 HttpException and report to Sentry with tenant and user tags', () => {
    const { host, statusMock, jsonMock } = createMockHost({
      originalUrl: '/admin/servicos',
      method: 'POST',
      tenantAccess: {
        tenant: { id: 'tenant-uuid-123' },
      },
      user: { id: 'user-uuid-456' },
    });

    const exception = new HttpException('Internal DB query failed', HttpStatus.INTERNAL_SERVER_ERROR);

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
  });

  it('should treat non-HttpException as 500, sanitize output, and report to Sentry', () => {
    const { host, statusMock, jsonMock } = createMockHost({
      url: '/tenants/custom-slug',
      method: 'GET',
      params: { tenantId: 'tenant-fallback-789' },
    });

    const rawError = new Error('Unexpected database disconnection');

    filter.catch(rawError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(rawError);
  });

  it('should fallback gracefully if Sentry throws an unexpected error', () => {
    (Sentry.withScope as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Sentry network failure');
    });

    const { host, statusMock, jsonMock } = createMockHost({
      url: '/test',
      method: 'GET',
    });

    const rawError = new Error('Database crash');

    expect(() => filter.catch(rawError, host)).not.toThrow();
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
  });
});
