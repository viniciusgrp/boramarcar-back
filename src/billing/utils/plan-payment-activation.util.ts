import type { AsaasSubscription } from '../../asaas/asaas.types';
import type { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Admin courtesy plans are `tenants.comp_until`, set by platform grantPlan
 * together with subscription_status INACTIVE. That grant is the manual
 * inactive/comp state. Trial signups are also INACTIVE, but comp_until is null.
 */
export function isCourtesyPlan(tenant: Pick<Tenant, 'comp_until'>): boolean {
  return Boolean(tenant.comp_until?.trim());
}

export function paymentBelongsToCurrentAsaasSubscription(
  tenant: Pick<Tenant, 'asaas_subscription_id'>,
  paymentSubscriptionId: string | null | undefined,
): boolean {
  const current = tenant.asaas_subscription_id?.trim() || '';
  const paid = paymentSubscriptionId?.trim() || '';

  return Boolean(current && paid && current === paid);
}

export function isAsaasSubscriptionCurrentlyActive(
  subscription: Pick<AsaasSubscription, 'status' | 'deleted'>,
): boolean {
  if (subscription.deleted) {
    return false;
  }

  return subscription.status?.trim().toUpperCase() === 'ACTIVE';
}
