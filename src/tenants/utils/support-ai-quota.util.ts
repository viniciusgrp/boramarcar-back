import type { PlanTier } from '../entities/plan-tier.type';
import { normalizePlanTier } from './plan-tier.util';

export interface SupportAiDailyQuota {
  tenant: number;
  user: number;
}

const QUOTA_BY_PLAN: Record<PlanTier, SupportAiDailyQuota> = {
  SOLO: { tenant: 40, user: 20 },
  PRO: { tenant: 100, user: 40 },
  ELITE: { tenant: 200, user: 50 },
};

/** Cotas diárias do Assistente IA conforme o plano base do tenant. */
export function getSupportAiDailyQuota(
  planTier: PlanTier | string | null | undefined,
): SupportAiDailyQuota {
  return QUOTA_BY_PLAN[normalizePlanTier(planTier)];
}
