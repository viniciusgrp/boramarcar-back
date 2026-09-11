import { sanitizeApiPath } from './sanitize-path.util';

describe('sanitizeApiPath', () => {
  it('should return unknown for empty or null path', () => {
    expect(sanitizeApiPath(undefined)).toBe('unknown');
    expect(sanitizeApiPath(null)).toBe('unknown');
    expect(sanitizeApiPath('')).toBe('unknown');
  });

  it('should strip query parameters', () => {
    expect(sanitizeApiPath('/appointments?date=2026-09-11&token=secret')).toBe(
      '/appointments',
    );
  });

  it('should extract pathname if full URL is passed', () => {
    expect(
      sanitizeApiPath('https://api.boramarcar.com.br/tenants/me?refresh=true'),
    ).toBe('/tenants/me');
  });

  it('should mask UUIDs as :id', () => {
    expect(
      sanitizeApiPath('/tenants/123e4567-e89b-12d3-a456-426614174000/services'),
    ).toBe('/tenants/:id/services');
  });

  it('should mask numeric IDs as :id', () => {
    expect(sanitizeApiPath('/appointments/42/cancel')).toBe(
      '/appointments/:id/cancel',
    );
    expect(sanitizeApiPath('/customers/999')).toBe('/customers/:id');
  });
});
