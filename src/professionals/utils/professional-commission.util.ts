import { BadRequestException } from '@nestjs/common';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';

export function canConfigureCommissions(planTier: PlanTier): boolean {
  return planTier === 'PRO' || planTier === 'ELITE';
}

export function resolveProfessionalCommissionPercent(
  planTier: PlanTier,
  commissionPercent?: number,
): number {
  if (!canConfigureCommissions(planTier)) {
    if (commissionPercent !== undefined && commissionPercent > 0) {
      throw new BadRequestException(
        'Comissões estão disponíveis a partir do plano Pro.',
      );
    }

    return 0;
  }

  if (commissionPercent === undefined) {
    return 0;
  }

  if (commissionPercent < 0 || commissionPercent > 100) {
    throw new BadRequestException(
      'A comissão do profissional deve estar entre 0 e 100.',
    );
  }

  return Math.round(commissionPercent * 100) / 100;
}

export function calculateCommissionAmount(
  totalPrice: number,
  commissionPercent: number,
): number {
  const safeTotal = Number.isFinite(totalPrice) ? totalPrice : 0;
  const safePercent = Number.isFinite(commissionPercent) ? commissionPercent : 0;

  return Math.round(safeTotal * (safePercent / 100) * 100) / 100;
}
