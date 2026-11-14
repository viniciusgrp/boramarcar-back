import type { Tenant } from '../entities/tenant.entity';
import type { UserRole } from '../entities/user-role.type';

const ASAAS_TENANT_KEYS = [
  'asaas_customer_id',
  'asaas_subscription_id',
  'asaas_pending_payment_id',
  'asaas_open_invoice_url',
  'asaas_account_id',
  'asaas_wallet_id',
  'support_ai_asaas_subscription_id',
  'pending_plan_payment_id',
  'pending_plan_invoice_url',
] as const;

export type TenantWithoutAsaasSecrets = Omit<
  Tenant,
  (typeof ASAAS_TENANT_KEYS)[number]
> & {
  asaas_customer_id: null;
  asaas_subscription_id: null;
  asaas_pending_payment_id: null;
  asaas_open_invoice_url: null;
  asaas_account_id: null;
  asaas_wallet_id: null;
  support_ai_asaas_subscription_id: null;
  pending_plan_payment_id: null;
  pending_plan_invoice_url: null;
};

export function canExposeTenantAsaasIds(
  role: UserRole | null | undefined,
): boolean {
  return role === 'OWNER';
}

export function stripTenantAsaasSecrets(
  tenant: Tenant,
): TenantWithoutAsaasSecrets {
  return omitAsaasSubaccountApiKey({
    ...tenant,
    asaas_customer_id: null,
    asaas_subscription_id: null,
    asaas_pending_payment_id: null,
    asaas_open_invoice_url: null,
    asaas_account_id: null,
    asaas_wallet_id: null,
    support_ai_asaas_subscription_id: null,
    pending_plan_payment_id: null,
    pending_plan_invoice_url: null,
  });
}

export function toSafeTenantForRole(
  tenant: Tenant,
  role: UserRole | null | undefined,
): Tenant | TenantWithoutAsaasSecrets {
  if (canExposeTenantAsaasIds(role)) {
    return omitAsaasSubaccountApiKey(tenant);
  }

  return stripTenantAsaasSecrets(tenant);
}

function omitAsaasSubaccountApiKey<T extends object>(tenant: T): T {
  const copy = { ...tenant };
  delete (copy as { asaas_subaccount_api_key_encrypted?: unknown })
    .asaas_subaccount_api_key_encrypted;
  return copy;
}
