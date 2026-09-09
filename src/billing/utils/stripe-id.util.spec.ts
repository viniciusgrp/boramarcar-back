import { extractStripeId } from './stripe-id.util';

describe('stripe-id.util', () => {
  it('extracts ids from strings and expanded objects', () => {
    expect(extractStripeId('cus_1')).toBe('cus_1');
    expect(extractStripeId({ id: 'cus_2' })).toBe('cus_2');
    expect(extractStripeId(null)).toBeNull();
  });
});
