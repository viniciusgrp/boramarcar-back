import type { SubscriptionStatus } from '../entities/subscription-status.type';
import type { Tenant } from '../entities/tenant.entity';

export const TRIAL_EXPIRED_MESSAGE = 'Período de testes expirou';

type TenantAccessFields = Pick<
  Tenant,
  'subscription_status' | 'trial_ends_at'
>;

export function parseUtcInstant(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function isSubscriptionActive(
  status: SubscriptionStatus | string,
): boolean {
  return status === 'ACTIVE';
}

export function isTrialActive(
  tenant: Pick<Tenant, 'trial_ends_at'>,
  now: Date = new Date(),
): boolean {
  const trialEndsAt = parseUtcInstant(tenant.trial_ends_at);

  if (!trialEndsAt) {
    return false;
  }

  return now.getTime() <= trialEndsAt.getTime();
}

export function hasTenantAdminAccess(
  tenant: TenantAccessFields,
  now: Date = new Date(),
): boolean {
  if (isSubscriptionActive(tenant.subscription_status)) {
    return true;
  }

  return isTrialActive(tenant, now);
}

export function getTrialDaysRemaining(
  tenant: Pick<Tenant, 'trial_ends_at'>,
  now: Date = new Date(),
): number {
  const trialEndsAt = parseUtcInstant(tenant.trial_ends_at);

  if (!trialEndsAt) {
    return 0;
  }

  const diffMs = trialEndsAt.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
