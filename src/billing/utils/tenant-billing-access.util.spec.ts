import type { Tenant } from '../../tenants/entities/tenant.entity';
import {
  tenantHasManageableSubscription,
  tenantHasPendingAsaasSubscription,
} from './tenant-billing-access.util';

describe('tenant-billing-access.util', () => {
  it('requires an Asaas subscription id and ACTIVE or PAST_DUE status', () => {
    expect(
      tenantHasManageableSubscription({
        asaas_subscription_id: 'sub_1',
        subscription_status: 'ACTIVE',
      } as Tenant),
    ).toBe(true);
    expect(
      tenantHasManageableSubscription({
        asaas_subscription_id: 'sub_1',
        subscription_status: 'INACTIVE',
      } as Tenant),
    ).toBe(false);
    expect(
      tenantHasManageableSubscription({
        asaas_subscription_id: null,
        subscription_status: 'ACTIVE',
      } as Tenant),
    ).toBe(false);
  });

  it('treats an unpaid trial subscription as pending, not a new checkout', () => {
    const pending = {
      asaas_subscription_id: 'sub_1',
      subscription_status: 'INACTIVE',
    } as Tenant;

    expect(tenantHasPendingAsaasSubscription(pending)).toBe(true);
    expect(tenantHasManageableSubscription(pending)).toBe(false);
    expect(
      tenantHasPendingAsaasSubscription({
        asaas_subscription_id: 'sub_1',
        subscription_status: 'ACTIVE',
      } as Tenant),
    ).toBe(false);
  });
});
