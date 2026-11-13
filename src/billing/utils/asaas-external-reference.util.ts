import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import { PLAN_TIERS } from '../../tenants/entities/plan-tier.type';
import { normalizePlanTier } from '../../tenants/utils/plan-tier.util';

const PLAN_UPGRADE_PREFIX = 'plan-upgrade:';

export function buildPlanExternalReference(
  tenantId: string,
  planTier: PlanTier,
): string {
  return `plan:${tenantId}:${planTier}`;
}

export function buildPlanUpgradeExternalReference(
  tenantId: string,
  planTier: PlanTier,
): string {
  return `${PLAN_UPGRADE_PREFIX}${tenantId}:${planTier}`;
}

export function parsePlanUpgradeExternalReference(
  value: string | null | undefined,
): { tenantId: string; planTier: PlanTier } | null {
  if (!value?.startsWith(PLAN_UPGRADE_PREFIX)) {
    return null;
  }

  const parts = value.slice(PLAN_UPGRADE_PREFIX.length).split(':');
  const planTier = parts.pop();
  const tenantId = parts.join(':');

  if (!tenantId || !planTier || !PLAN_TIERS.includes(planTier as PlanTier)) {
    return null;
  }

  return {
    tenantId,
    planTier: planTier as PlanTier,
  };
}

export function isPlanUpgradeExternalReference(
  value: string | null | undefined,
): boolean {
  return parsePlanUpgradeExternalReference(value) !== null;
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
