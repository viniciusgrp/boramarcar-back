import {
  canAccessSupportAi,
  resolveSupportAiAccess,
} from './support-ai-access.util';

describe('support-ai-access.util', () => {
  it('requires ACTIVE subscription', () => {
    expect(
      resolveSupportAiAccess({
        subscription_status: 'INACTIVE',
        support_ai_enabled: true,
        support_ai_status: 'active',
      }),
    ).toEqual({ allowed: false, reason: 'subscription_required' });
  });

  it('requires addon flag', () => {
    expect(
      resolveSupportAiAccess({
        subscription_status: 'ACTIVE',
        support_ai_enabled: false,
        support_ai_status: null,
      }),
    ).toEqual({ allowed: false, reason: 'addon_required' });
  });

  it('cuts access immediately on past_due', () => {
    expect(
      resolveSupportAiAccess({
        subscription_status: 'ACTIVE',
        support_ai_enabled: true,
        support_ai_status: 'past_due',
      }),
    ).toEqual({ allowed: false, reason: 'addon_past_due' });
  });

  it('allows courtesy with enabled flag and null status', () => {
    expect(
      canAccessSupportAi({
        subscription_status: 'ACTIVE',
        support_ai_enabled: true,
        support_ai_status: null,
      }),
    ).toBe(true);
  });

  it('allows active paid addon', () => {
    expect(
      canAccessSupportAi({
        subscription_status: 'ACTIVE',
        support_ai_enabled: true,
        support_ai_status: 'active',
      }),
    ).toBe(true);
  });
});
