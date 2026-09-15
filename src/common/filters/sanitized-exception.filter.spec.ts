import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { SanitizedExceptionFilter } from './sanitized-exception.filter';
import type { ApiErrorEventsService } from '../api-errors/api-error-events.service';

describe('SanitizedExceptionFilter', () => {
  const record = jest.fn().mockResolvedValue(undefined);
  let filter: SanitizedExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new SanitizedExceptionFilter({
      record,
    } as unknown as ApiErrorEventsService);
  });

  const createMockHost = (req: Record<string, unknown> = {}) => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const getResponse = jest.fn().mockReturnValue({
      status: statusMock,
      json: jsonMock,
    });
    const getRequest = jest.fn().mockReturnValue(req);

    const host = {
      switchToHttp: () => ({
        getResponse,
        getRequest,
      }),
    } as unknown as ArgumentsHost;

    return { host, statusMock, jsonMock };
  };

  it('should pass through 400 errors without persisting', () => {
    const { host, statusMock, jsonMock } = createMockHost({
      url: '/appointments',
      method: 'POST',
    });

    const exception = new HttpException(
      'Dados invalidos',
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Dados invalidos',
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('should sanitize 500 HttpException and persist tenant context', () => {
    const { host, statusMock, jsonMock } = createMockHost({
      originalUrl: '/admin/servicos',
      method: 'POST',
      tenantAccess: {
        tenant: { id: 'tenant-uuid-123' },
      },
      user: { id: 'user-uuid-456' },
    });

    const exception = new HttpException(
      'Internal DB query failed',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-uuid-123',
        userId: 'user-uuid-456',
        method: 'POST',
        path: '/admin/servicos',
        statusCode: 500,
        exceptionName: 'HttpException',
        message: 'Internal DB query failed',
      }),
    );
  });

  it('should treat non-HttpException as 500, sanitize output, and persist', () => {
    const { host, statusMock, jsonMock } = createMockHost({
      url: '/tenants/custom-slug',
      method: 'GET',
      params: { tenantId: '11111111-1111-4111-8111-111111111111' },
    });

    const rawError = new Error('Unexpected database disconnection');

    filter.catch(rawError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: '11111111-1111-4111-8111-111111111111',
        method: 'GET',
        path: '/tenants/custom-slug',
        statusCode: 500,
        exceptionName: 'Error',
        message: 'Unexpected database disconnection',
      }),
    );
  });

  it('should still respond if persist throws', () => {
    record.mockRejectedValueOnce(new Error('insert failed'));

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
