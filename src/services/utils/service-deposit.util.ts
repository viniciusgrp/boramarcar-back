import { BadRequestException } from '@nestjs/common';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';

export interface ResolvedServiceDepositFields {
  requires_deposit: boolean;
  deposit_amount: number | null;
}

export function resolveServiceDepositFields(
  planTier: PlanTier,
  requiresDeposit?: boolean,
  depositAmount?: number | null,
): ResolvedServiceDepositFields {
  if (planTier !== 'ELITE') {
    if (requiresDeposit) {
      throw new BadRequestException(
        'Pagamento de sinal está disponível apenas no plano Elite.',
      );
    }

    return { requires_deposit: false, deposit_amount: null };
  }

  if (!requiresDeposit) {
    return { requires_deposit: false, deposit_amount: null };
  }

  if (depositAmount === undefined || depositAmount === null || depositAmount <= 0) {
    throw new BadRequestException(
      'Informe o valor do sinal quando exigir pagamento antecipado.',
    );
  }

  return { requires_deposit: true, deposit_amount: depositAmount };
}
