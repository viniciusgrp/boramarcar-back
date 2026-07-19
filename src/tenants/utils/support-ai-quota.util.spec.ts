import { getSupportAiDailyQuota } from './support-ai-quota.util';

describe('support-ai-quota.util', () => {
  it('returns Solo quotas', () => {
    expect(getSupportAiDailyQuota('SOLO')).toEqual({ tenant: 40, user: 20 });
  });

  it('returns Pro quotas', () => {
    expect(getSupportAiDailyQuota('PRO')).toEqual({ tenant: 100, user: 40 });
  });

  it('returns Elite quotas', () => {
    expect(getSupportAiDailyQuota('ELITE')).toEqual({ tenant: 200, user: 50 });
  });

  it('falls back to Solo for unknown tier', () => {
    expect(getSupportAiDailyQuota('UNKNOWN')).toEqual({ tenant: 40, user: 20 });
  });
});
