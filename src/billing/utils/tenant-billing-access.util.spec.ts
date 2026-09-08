import type { Tenant } from '../../tenants/entities/tenant.entity';
import { tenantHasManageableSubscription } from './tenant-billing-access.util';

describe('tenant-billing-access.util', () => {
  it('requires a Stripe subscription id and ACTIVE or PAST_DUE status', () => {
    expect(
      tenantHasManageableSubscription({
        stripe_subscription_id: 'sub_1',
        subscription_status: 'ACTIVE',
      } as Tenant),
    ).toBe(true);
    expect(
      tenantHasManageableSubscription({
        stripe_subscription_id: 'sub_1',
        subscription_status: 'INACTIVE',
      } as Tenant),
    ).toBe(false);
    expect(
      tenantHasManageableSubscription({
        stripe_subscription_id: null,
        subscription_status: 'ACTIVE',
      } as Tenant),
    ).toBe(false);
  });
});
