import {
  BILLING_GRACE_DAYS,
  hasPendingTrialPaymentGrace,
  isPaidSubscriptionGraceExpired,
} from './billing-grace.util';

describe('billing-grace.util', () => {
  const now = new Date('2026-11-12T12:00:00.000Z');

  it('keeps the 5-day grace window', () => {
    expect(BILLING_GRACE_DAYS).toBe(5);
  });

  it('allows trial grace while a pending Asaas payment exists', () => {
    expect(
      hasPendingTrialPaymentGrace(
        {
          asaas_pending_payment_id: 'pay_1',
          trial_ends_at: '2026-11-10T12:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('cuts trial grace without a pending payment', () => {
    expect(
      hasPendingTrialPaymentGrace(
        {
          asaas_pending_payment_id: null,
          trial_ends_at: '2026-11-10T12:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  it('marks paid subscription grace as expired after 5 days', () => {
    expect(
      isPaidSubscriptionGraceExpired(
        { subscription_expires_at: '2026-11-01T00:00:00.000Z' },
        now,
      ),
    ).toBe(true);
    expect(
      isPaidSubscriptionGraceExpired(
        { subscription_expires_at: '2026-11-12T00:00:00.000Z' },
        now,
      ),
    ).toBe(false);
  });
});
