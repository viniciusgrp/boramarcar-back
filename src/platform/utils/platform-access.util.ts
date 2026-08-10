import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import type { SubscriptionStatus } from '../../tenants/entities/subscription-status.type';
import type { Tenant } from '../../tenants/entities/tenant.entity';
import {
  hasTenantAdminAccess,
  isTrialActive,
} from '../../tenants/utils/tenant-access.util';

export type PlatformAccessLabel =
  | 'active'
  | 'trial'
  | 'past_due'
  | 'canceled'
  | 'inactive';

export function resolvePlatformAccessLabel(
  tenant: Pick<Tenant, 'subscription_status' | 'trial_ends_at'>,
  now: Date = new Date(),
): PlatformAccessLabel {
  if (tenant.subscription_status === 'ACTIVE') {
    return 'active';
  }

  if (tenant.subscription_status === 'PAST_DUE') {
    return 'past_due';
  }

  if (tenant.subscription_status === 'CANCELED') {
    return 'canceled';
  }

  if (isTrialActive(tenant, now)) {
    return 'trial';
  }

  return 'inactive';
}

export function matchesAccessFilter(
  label: PlatformAccessLabel,
  filter: string | undefined,
): boolean {
  if (!filter || filter === 'all') {
    return true;
  }

  return label === filter;
}

export function matchesPlanFilter(
  planTier: PlanTier,
  filter: string | undefined,
): boolean {
  if (!filter || filter === 'all') {
    return true;
  }

  return planTier === filter;
}

export function matchesSearch(
  tenant: Pick<Tenant, 'name' | 'slug' | 'contact_phone'>,
  ownerEmail: string | null,
  search: string | undefined,
): boolean {
  const term = search?.trim().toLowerCase();
  if (!term) {
    return true;
  }

  const haystack = [
    tenant.name,
    tenant.slug,
    tenant.contact_phone ?? '',
    ownerEmail ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(term);
}

export function isTenantBillingActive(
  tenant: Pick<Tenant, 'subscription_status' | 'trial_ends_at'>,
  now: Date = new Date(),
): boolean {
  return hasTenantAdminAccess(tenant, now);
}

export function toMonthKey(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  if (!year || !month) {
    return monthKey;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function normalizeSubscriptionStatus(
  status: string | null | undefined,
): SubscriptionStatus {
  if (
    status === 'ACTIVE' ||
    status === 'PAST_DUE' ||
    status === 'CANCELED' ||
    status === 'INACTIVE'
  ) {
    return status;
  }

  return 'INACTIVE';
}
