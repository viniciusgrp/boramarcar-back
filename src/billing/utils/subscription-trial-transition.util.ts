import { addMonths, parseISO } from 'date-fns';
import type { SubscriptionStatus } from '../../tenants/entities/subscription-status.type';
import type { Tenant } from '../../tenants/entities/tenant.entity';

export interface SubscriptionTrialTransition {
  trialEndsAt?: string | null;
  preSubscriptionTrialEndsAt?: string | null;
}

export function resolveSubscriptionTrialTransition(
  tenant: Tenant | null,
  subscriptionStatus: SubscriptionStatus,
): SubscriptionTrialTransition {
  if (!tenant) {
    return {};
  }

  if (subscriptionStatus === 'ACTIVE') {
    const transition: SubscriptionTrialTransition = {
      trialEndsAt: null,
    };

    if (tenant.trial_ends_at?.trim()) {
      transition.preSubscriptionTrialEndsAt = tenant.trial_ends_at;
    }

    return transition;
  }

  if (subscriptionStatus === 'CANCELED' || subscriptionStatus === 'INACTIVE') {
    const reference = tenant.pre_subscription_trial_ends_at?.trim();

    if (reference) {
      return {
        trialEndsAt: addMonths(parseISO(reference), 1).toISOString(),
      };
    }
  }

  return {};
}
