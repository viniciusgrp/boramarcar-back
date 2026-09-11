export const MAX_ERROR_MESSAGE_LENGTH = 500;
export const MAX_ERROR_STACK_LENGTH = 2000;

export type ApiErrorEventInput = {
  tenantId?: string | null;
  userId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  exceptionName?: string | null;
  message?: string | null;
  stack?: string | null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function truncateText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length <= maxLength
    ? trimmed
    : trimmed.slice(0, maxLength);
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_REGEX.test(value));
}

export function extractExceptionName(exception: unknown): string {
  if (exception instanceof Error && exception.name) {
    return exception.name;
  }

  return 'UnknownError';
}

export function extractExceptionMessage(exception: unknown): string {
  if (exception instanceof Error && exception.message) {
    return exception.message;
  }

  if (typeof exception === 'string' && exception.trim()) {
    return exception;
  }

  return 'Unknown error';
}

export function extractExceptionStack(exception: unknown): string | null {
  if (exception instanceof Error && exception.stack) {
    return exception.stack;
  }

  return null;
}

export function toApiErrorInsertRow(input: ApiErrorEventInput) {
  return {
    tenant_id: isUuid(input.tenantId) ? input.tenantId : null,
    user_id: isUuid(input.userId) ? input.userId : null,
    method: (input.method || 'UNKNOWN').toUpperCase().slice(0, 16),
    path: input.path || 'unknown',
    status_code: input.statusCode,
    exception_name: truncateText(input.exceptionName, 120),
    message: truncateText(input.message, MAX_ERROR_MESSAGE_LENGTH),
    stack: truncateText(input.stack, MAX_ERROR_STACK_LENGTH),
  };
}
