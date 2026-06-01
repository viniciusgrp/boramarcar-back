import type { PlanTier } from '../entities/plan-tier.type';
import { PLAN_TIERS } from '../entities/plan-tier.type';

export const SOLO_PROFESSIONAL_LIMIT = 1;
export const PRO_PROFESSIONAL_LIMIT = 5;

export const SOLO_PROFESSIONAL_LIMIT_MESSAGE =
  'Plano Solo permite apenas 1 profissional. Faça o upgrade para expandir sua equipe.';

export const PRO_PROFESSIONAL_LIMIT_MESSAGE =
  'Limite de 5 profissionais atingido. Faça upgrade para o plano Elite.';

export function normalizePlanTier(
  value: string | null | undefined,
): PlanTier {
  if (value && PLAN_TIERS.includes(value as PlanTier)) {
    return value as PlanTier;
  }

  return 'SOLO';
}

export function getProfessionalLimit(planTier: PlanTier): number | null {
  switch (planTier) {
    case 'SOLO':
      return SOLO_PROFESSIONAL_LIMIT;
    case 'PRO':
      return PRO_PROFESSIONAL_LIMIT;
    case 'ELITE':
      return null;
    default:
      return SOLO_PROFESSIONAL_LIMIT;
  }
}

export function getProfessionalLimitMessage(planTier: PlanTier): string | null {
  switch (planTier) {
    case 'SOLO':
      return SOLO_PROFESSIONAL_LIMIT_MESSAGE;
    case 'PRO':
      return PRO_PROFESSIONAL_LIMIT_MESSAGE;
    case 'ELITE':
      return null;
    default:
      return SOLO_PROFESSIONAL_LIMIT_MESSAGE;
  }
}

export function canAddActiveProfessional(
  planTier: PlanTier,
  activeProfessionalCount: number,
): boolean {
  const limit = getProfessionalLimit(planTier);

  if (limit === null) {
    return true;
  }

  return activeProfessionalCount < limit;
}
