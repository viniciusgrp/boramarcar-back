import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import { normalizePlanTier } from '../../tenants/utils/plan-tier.util';

export function buildPlanExternalReference(
  tenantId: string,
  planTier: PlanTier,
): string {
  return `plan:${tenantId}:${planTier}`;
}

export function buildSupportAiExternalReference(tenantId: string): string {
  return `support-ai:${tenantId}`;
}

export function buildDepositExternalReference(appointmentId: string): string {
  return `deposit:${appointmentId}`;
}

export function parsePlanExternalReference(value: string | null | undefined): {
  tenantId: string;
  planTier: PlanTier;
} | null {
  if (!value?.startsWith('plan:')) {
    return null;
  }

  const parts = value.split(':');

  if (parts.length < 3 || !parts[1] || !parts[2]) {
    return null;
  }

  return {
    tenantId: parts[1],
    planTier: normalizePlanTier(parts[2]),
  };
}

export function isSupportAiExternalReference(
  value: string | null | undefined,
): boolean {
  return Boolean(value?.startsWith('support-ai:'));
}

export function parseDepositExternalReference(
  value: string | null | undefined,
): string | null {
  if (!value?.startsWith('deposit:')) {
    return null;
  }

  const appointmentId = value.slice('deposit:'.length).trim();
  return appointmentId || null;
}
