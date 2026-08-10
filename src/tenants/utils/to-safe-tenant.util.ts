import type { Tenant } from '../entities/tenant.entity';
import type { UserRole } from '../entities/user-role.type';

const STRIPE_TENANT_KEYS = [
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_connect_account_id',
  'support_ai_stripe_subscription_item_id',
] as const;

export type TenantWithoutStripeSecrets = Omit<
  Tenant,
  (typeof STRIPE_TENANT_KEYS)[number]
> & {
  stripe_customer_id: null;
  stripe_subscription_id: null;
  stripe_connect_account_id: null;
  support_ai_stripe_subscription_item_id: null;
};

/** Stripe account identifiers are owner-only (billing / Connect). */
export function canExposeTenantStripeIds(role: UserRole | null | undefined): boolean {
  return role === 'OWNER';
}

export function stripTenantStripeSecrets(tenant: Tenant): TenantWithoutStripeSecrets {
  return {
    ...tenant,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_connect_account_id: null,
    support_ai_stripe_subscription_item_id: null,
  };
}

export function toSafeTenantForRole(
  tenant: Tenant,
  role: UserRole | null | undefined,
): Tenant | TenantWithoutStripeSecrets {
  if (canExposeTenantStripeIds(role)) {
    return tenant;
  }

  return stripTenantStripeSecrets(tenant);
}
