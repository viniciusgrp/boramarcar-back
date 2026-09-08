import { addMonths, parseISO } from 'date-fns';
import type { Tenant } from '../../tenants/entities/tenant.entity';
import { resolveSubscriptionTrialTransition } from './subscription-trial-transition.util';

describe('subscription-trial-transition.util', () => {
  const tenant = {
    trial_ends_at: '2026-09-20T00:00:00.000Z',
    pre_subscription_trial_ends_at: '2026-09-08T00:00:00.000Z',
  } as Tenant;

  it('clears the live trial when the subscription becomes ACTIVE', () => {
    expect(resolveSubscriptionTrialTransition(tenant, 'ACTIVE')).toEqual({
      trialEndsAt: null,
      preSubscriptionTrialEndsAt: '2026-09-20T00:00:00.000Z',
    });
  });

  it('restores a one-month window after cancel when a pre-subscription trial exists', () => {
    expect(resolveSubscriptionTrialTransition(tenant, 'CANCELED')).toEqual({
      trialEndsAt: addMonths(
        parseISO('2026-09-08T00:00:00.000Z'),
        1,
      ).toISOString(),
    });
  });

  it('returns an empty patch when there is no tenant', () => {
    expect(resolveSubscriptionTrialTransition(null, 'ACTIVE')).toEqual({});
  });
});
