import {
  MAX_ERROR_MESSAGE_LENGTH,
  extractExceptionName,
  isUuid,
  toApiErrorInsertRow,
  truncateText,
} from './api-error-event.util';

describe('api-error-event.util', () => {
  it('truncates long messages', () => {
    const long = 'x'.repeat(MAX_ERROR_MESSAGE_LENGTH + 20);
    expect(truncateText(long, MAX_ERROR_MESSAGE_LENGTH)?.length).toBe(
      MAX_ERROR_MESSAGE_LENGTH,
    );
  });

  it('accepts only UUID tenant ids', () => {
    expect(isUuid('tenant-uuid-123')).toBe(false);
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('maps insert row without invalid tenant id', () => {
    const row = toApiErrorInsertRow({
      tenantId: 'not-a-uuid',
      userId: '11111111-1111-4111-8111-111111111111',
      method: 'post',
      path: '/services',
      statusCode: 500,
      exceptionName: extractExceptionName(new Error('boom')),
      message: 'boom',
      stack: 'Error: boom',
    });

    expect(row.tenant_id).toBeNull();
    expect(row.user_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(row.method).toBe('POST');
    expect(row.status_code).toBe(500);
    expect(row.exception_name).toBe('Error');
  });
});
