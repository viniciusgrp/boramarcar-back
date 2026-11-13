import {
  BILLING_GRACE_DAYS,
  asaasDateToIso,
  hasPendingTrialPaymentGrace,
  isPaidSubscriptionGraceExpired,
  laterIsoInstant,
  periodEndFromPaidChargeDate,
  toAsaasDate,
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

  it('keeps the later expiry when an older charge is paid', () => {
    expect(
      laterIsoInstant('2026-12-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'),
    ).toBe('2026-12-01T00:00:00.000Z');
    expect(
      laterIsoInstant('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'),
    ).toBe('2026-12-01T00:00:00.000Z');
  });

  it('sets the period end one month after the paid charge, at Sao Paulo midnight', () => {
    expect(periodEndFromPaidChargeDate('2026-11-01')).toBe(
      '2026-12-01T03:00:00.000Z',
    );
    expect(periodEndFromPaidChargeDate('2026-01-31')).toBe(
      '2026-02-28T03:00:00.000Z',
    );
    expect(periodEndFromPaidChargeDate('2024-01-31')).toBe(
      '2024-02-29T03:00:00.000Z',
    );
    expect(
      toAsaasDate(new Date(periodEndFromPaidChargeDate('2026-11-01')!)),
    ).toBe('2026-12-01');
  });

  it('formats Asaas dates on the America/Sao_Paulo calendar', () => {
    expect(toAsaasDate(new Date('2026-11-14T01:30:00.000Z'))).toBe(
      '2026-11-13',
    );
    expect(toAsaasDate(new Date('2026-11-14T02:59:00.000Z'))).toBe(
      '2026-11-13',
    );
    expect(toAsaasDate(new Date('2026-11-14T03:00:00.000Z'))).toBe(
      '2026-11-14',
    );
    expect(asaasDateToIso('2026-12-01')).toBe('2026-12-01T03:00:00.000Z');
    expect(toAsaasDate(new Date(asaasDateToIso('2026-12-01')!))).toBe(
      '2026-12-01',
    );
  });

  it('compares expiry instants as dates when the text order differs', () => {
    expect(
      laterIsoInstant('2026-12-01T00:00:00.000Z', '2026-11-30T22:00:00-03:00'),
    ).toBe('2026-11-30T22:00:00-03:00');
    expect(
      laterIsoInstant('2026-12-01T03:00:00+00:00', '2026-12-01T00:00:00.000Z'),
    ).toBe('2026-12-01T03:00:00+00:00');
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
