import type { Tenant } from '../entities/tenant.entity';
import type { UserRole } from '../entities/user-role.type';
import {
  canExposeTenantAsaasIds,
  stripTenantAsaasSecrets,
  toSafeTenantForRole,
} from './to-safe-tenant.util';

describe('toSafeTenantForRole', () => {
  const tenant = {
    id: 't1',
    asaas_customer_id: 'cus_x',
    asaas_subscription_id: 'sub_x',
    asaas_account_id: 'acc_x',
    asaas_wallet_id: 'wal_x',
    support_ai_asaas_subscription_id: 'sub_ai',
  } as Tenant;

  it.each(['ADMIN', 'PROFESSIONAL', null, undefined] as const)(
    'strips Asaas IDs for role %s',
    (role) => {
      const safe = toSafeTenantForRole(tenant, role);
      expect(safe.asaas_customer_id).toBeNull();
      expect(safe.asaas_subscription_id).toBeNull();
      expect(safe.asaas_account_id).toBeNull();
      expect(safe.asaas_wallet_id).toBeNull();
      expect(safe.support_ai_asaas_subscription_id).toBeNull();
      expect(canExposeTenantAsaasIds(role as UserRole | null)).toBe(false);
    },
  );

  it('keeps Asaas IDs for OWNER', () => {
    const safe = toSafeTenantForRole(tenant, 'OWNER');
    expect(safe.asaas_customer_id).toBe('cus_x');
    expect(safe.asaas_subscription_id).toBe('sub_x');
    expect(safe.asaas_wallet_id).toBe('wal_x');
  });

  it('never returns the encrypted subaccount api key', () => {
    const withKey = {
      ...tenant,
      asaas_subaccount_api_key_encrypted: 'enc:v1:secret',
    } as Tenant;

    for (const role of ['OWNER', 'ADMIN', 'PROFESSIONAL', null] as const) {
      const safe = toSafeTenantForRole(withKey, role);
      expect(JSON.stringify(safe)).not.toContain('enc:v1:secret');
      expect(JSON.stringify(safe)).not.toContain(
        'asaas_subaccount_api_key_encrypted',
      );
    }

    expect(JSON.stringify(stripTenantAsaasSecrets(withKey))).not.toContain(
      'enc:v1:secret',
    );
  });

  it('stripTenantAsaasSecrets nulls all Asaas secret fields', () => {
    const stripped = stripTenantAsaasSecrets(tenant);
    expect(stripped.asaas_customer_id).toBeNull();
    expect(stripped.id).toBe('t1');
  });
});
