import {
  formatMonthLabel,
  matchesAccessFilter,
  matchesPlanFilter,
  matchesSearch,
  resolvePlatformAccessLabel,
  toMonthKey,
} from './platform-access.util';

describe('platform-access.util', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');

  it('labels ACTIVE subscription as active', () => {
    expect(
      resolvePlatformAccessLabel(
        { subscription_status: 'ACTIVE', trial_ends_at: null },
        now,
      ),
    ).toBe('active');
  });

  it('labels PAST_DUE as past_due even with trial', () => {
    expect(
      resolvePlatformAccessLabel(
        {
          subscription_status: 'PAST_DUE',
          trial_ends_at: '2026-12-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe('past_due');
  });

  it('labels valid trial as trial when subscription inactive', () => {
    expect(
      resolvePlatformAccessLabel(
        {
          subscription_status: 'INACTIVE',
          trial_ends_at: '2026-08-20T00:00:00.000Z',
        },
        now,
      ),
    ).toBe('trial');
  });

  it('labels expired trial as inactive', () => {
    expect(
      resolvePlatformAccessLabel(
        {
          subscription_status: 'INACTIVE',
          trial_ends_at: '2026-08-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe('inactive');
  });

  it('matches access and plan filters', () => {
    expect(matchesAccessFilter('active', undefined)).toBe(true);
    expect(matchesAccessFilter('active', 'all')).toBe(true);
    expect(matchesAccessFilter('active', 'trial')).toBe(false);
    expect(matchesPlanFilter('PRO', 'PRO')).toBe(true);
    expect(matchesPlanFilter('PRO', 'SOLO')).toBe(false);
  });

  it('matches search across name, slug, phone and email', () => {
    const tenant = {
      name: 'Barbearia Central',
      slug: 'barbearia-central',
      contact_phone: '11999990000',
    };

    expect(matchesSearch(tenant, 'dono@email.com', 'central')).toBe(true);
    expect(matchesSearch(tenant, 'dono@email.com', 'dono@')).toBe(true);
    expect(matchesSearch(tenant, 'dono@email.com', '9999')).toBe(true);
    expect(matchesSearch(tenant, 'dono@email.com', 'xyz')).toBe(false);
    expect(matchesSearch(tenant, null, undefined)).toBe(true);
  });

  it('builds month keys and labels', () => {
    expect(toMonthKey('2026-08-10T15:00:00.000Z')).toBe('2026-08');
    expect(formatMonthLabel('2026-08')).toMatch(/2026/);
  });
});
