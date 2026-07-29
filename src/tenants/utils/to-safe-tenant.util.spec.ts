import type { Tenant } from '../entities/tenant.entity';
import type { UserRole } from '../entities/user-role.type';
import {
  canExposeTenantStripeIds,
  stripTenantStripeSecrets,
  toSafeTenantForRole,
} from './to-safe-tenant.util';

describe('toSafeTenantForRole', () => {
  const tenant = {
    id: 't1',
    stripe_customer_id: 'cus_x',
    stripe_subscription_id: 'sub_x',
    stripe_connect_account_id: 'acct_x',
    support_ai_stripe_subscription_item_id: 'si_x',
  } as Tenant;

  it.each(['ADMIN', 'PROFESSIONAL', null, undefined] as const)(
    'strips Stripe IDs for role %s',
    (role) => {
      const safe = toSafeTenantForRole(tenant, role as UserRole | null | undefined);
      expect(safe.stripe_customer_id).toBeNull();
      expect(safe.stripe_subscription_id).toBeNull();
      expect(safe.stripe_connect_account_id).toBeNull();
      expect(safe.support_ai_stripe_subscription_item_id).toBeNull();
      expect(canExposeTenantStripeIds(role as UserRole | null)).toBe(false);
    },
  );

  it('keeps Stripe IDs for OWNER', () => {
    const safe = toSafeTenantForRole(tenant, 'OWNER');
    expect(safe.stripe_customer_id).toBe('cus_x');
    expect(safe.stripe_subscription_id).toBe('sub_x');
    expect(safe.stripe_connect_account_id).toBe('acct_x');
  });

  it('stripTenantStripeSecrets nulls all Stripe secret fields', () => {
    const stripped = stripTenantStripeSecrets(tenant);
    expect(stripped.stripe_customer_id).toBeNull();
    expect(stripped.id).toBe('t1');
  });
});
