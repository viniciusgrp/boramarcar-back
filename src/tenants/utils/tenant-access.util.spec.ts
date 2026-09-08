import {
  getTrialDaysRemaining,
  hasTenantAdminAccess,
  isSubscriptionActive,
  isTrialActive,
  parseUtcInstant,
} from './tenant-access.util';

describe('tenant-access.util', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('parses valid UTC instants and rejects empty or invalid values', () => {
    expect(parseUtcInstant('2026-09-08T12:00:00.000Z')?.toISOString()).toBe(
      '2026-09-08T12:00:00.000Z',
    );
    expect(parseUtcInstant(null)).toBeNull();
    expect(parseUtcInstant('  ')).toBeNull();
    expect(parseUtcInstant('not-a-date')).toBeNull();
  });

  it('treats only ACTIVE as a paid subscription', () => {
    expect(isSubscriptionActive('ACTIVE')).toBe(true);
    expect(isSubscriptionActive('INACTIVE')).toBe(false);
    expect(isSubscriptionActive('PAST_DUE')).toBe(false);
  });

  it('treats trial as active until the end instant inclusive', () => {
    expect(isTrialActive({ trial_ends_at: '2026-09-08T12:00:00.000Z' }, now)).toBe(
      true,
    );
    expect(isTrialActive({ trial_ends_at: '2026-09-08T11:59:59.000Z' }, now)).toBe(
      false,
    );
    expect(isTrialActive({ trial_ends_at: null }, now)).toBe(false);
  });

  it('allows admin access with ACTIVE subscription even after trial ended', () => {
    expect(
      hasTenantAdminAccess(
        {
          subscription_status: 'ACTIVE',
          trial_ends_at: '2020-01-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('blocks inactive tenants with expired trial', () => {
    expect(
      hasTenantAdminAccess(
        {
          subscription_status: 'INACTIVE',
          trial_ends_at: '2026-09-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  it('allows access while trial is still running', () => {
    expect(
      hasTenantAdminAccess(
        {
          subscription_status: 'INACTIVE',
          trial_ends_at: '2026-09-20T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('computes remaining trial days with injected clock', () => {
    expect(
      getTrialDaysRemaining(
        { trial_ends_at: '2026-09-10T12:00:00.000Z' },
        now,
      ),
    ).toBe(2);
    expect(
      getTrialDaysRemaining(
        { trial_ends_at: '2026-09-08T11:00:00.000Z' },
        now,
      ),
    ).toBe(0);
    expect(getTrialDaysRemaining({ trial_ends_at: null }, now)).toBe(0);
  });
});
