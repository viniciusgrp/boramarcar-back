import { BadRequestException } from '@nestjs/common';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import { canConfigureCommissions } from '../../professionals/utils/professional-commission.util';
import { isValidCustomCommissionRate } from './service-commission.util';

export function resolveServiceCustomCommissionRate(
  planTier: PlanTier,
  customCommissionRate?: number | null,
): number | null {
  if (customCommissionRate === undefined || customCommissionRate === null) {
    return null;
  }

  if (!canConfigureCommissions(planTier)) {
    if (customCommissionRate > 0) {
      throw new BadRequestException(
        'Comissões específicas por serviço estão disponíveis a partir do plano Pro.',
      );
    }

    return null;
  }

  if (!isValidCustomCommissionRate(customCommissionRate)) {
    throw new BadRequestException(
      'A taxa de comissão específica deve estar entre 0 e 100.',
    );
  }

  return Math.round(Number(customCommissionRate) * 100) / 100;
}
