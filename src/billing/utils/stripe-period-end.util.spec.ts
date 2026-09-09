import {
  extractSubscriptionPeriodEnd,
  stripePeriodEndToIso,
} from './stripe-period-end.util';

describe('stripe-period-end.util', () => {
  it('reads period end from the subscription root', () => {
    expect(extractSubscriptionPeriodEnd({ current_period_end: 1700000000 })).toBe(
      1700000000,
    );
  });

  it('falls back to the first subscription item', () => {
    expect(
      extractSubscriptionPeriodEnd({
        items: { data: [{ current_period_end: 1700001111 }] },
      }),
    ).toBe(1700001111);
  });

  it('converts unix seconds to ISO and rejects invalid values', () => {
    expect(stripePeriodEndToIso(1700000000)).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
    expect(stripePeriodEndToIso(0)).toBeNull();
    expect(stripePeriodEndToIso(null)).toBeNull();
  });
});
