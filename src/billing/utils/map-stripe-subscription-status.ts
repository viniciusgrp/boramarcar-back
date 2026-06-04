import type { SubscriptionStatus } from '../../tenants/entities/subscription-status.type';
import type { StripeSubscriptionStatus } from '../types/stripe-api.types';

export function mapStripeSubscriptionStatus(
  stripeStatus: StripeSubscriptionStatus,
): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED';
    case 'incomplete':
    case 'paused':
    default:
      return 'INACTIVE';
  }
}
