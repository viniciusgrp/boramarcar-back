import { BadRequestException } from '@nestjs/common';

export interface ResolvedServiceDepositFields {
  requires_deposit: boolean;
  deposit_amount: number | null;
}

export function resolveServiceDepositFields(
  canUseDepositFeatures: boolean,
  requiresDeposit?: boolean,
  depositAmount?: number | null,
): ResolvedServiceDepositFields {
  if (!canUseDepositFeatures) {
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
