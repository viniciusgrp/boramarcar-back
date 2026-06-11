import type { SubscriptionStatus } from '../../tenants/entities/subscription-status.type';
import type { Tenant } from '../../tenants/entities/tenant.entity';

const MANAGEABLE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'ACTIVE',
  'PAST_DUE',
];

export function tenantHasManageableSubscription(tenant: Tenant): boolean {
  if (!tenant.stripe_subscription_id?.trim()) {
    return false;
  }

  return MANAGEABLE_SUBSCRIPTION_STATUSES.includes(tenant.subscription_status);
}
