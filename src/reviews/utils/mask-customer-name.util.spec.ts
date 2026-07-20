import { maskCustomerFirstName } from './mask-customer-name.util';

describe('maskCustomerFirstName', () => {
  it('returns first name only', () => {
    expect(maskCustomerFirstName('Maria Silva Santos')).toBe('Maria');
  });

  it('falls back when empty', () => {
    expect(maskCustomerFirstName('')).toBe('Cliente');
    expect(maskCustomerFirstName(null)).toBe('Cliente');
  });
});
