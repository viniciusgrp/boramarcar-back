import { BadRequestException } from '@nestjs/common';
import {
  DEPOSIT_FEATURE_UNAVAILABLE_MESSAGE,
  DEPOSIT_SUBACCOUNT_REQUIRED_MESSAGE,
} from '../../tenants/constants/deposit-feature.constants';

export interface ResolvedServiceDepositFields {
  requires_deposit: boolean;
  deposit_amount: number | null;
}

export function resolveServiceDepositFields(
  canUseDepositFeatures: boolean,
  requiresDeposit?: boolean,
  depositAmount?: number | null,
  canChargeDeposits = true,
): ResolvedServiceDepositFields {
  if (!canUseDepositFeatures) {
    if (requiresDeposit) {
      throw new BadRequestException(DEPOSIT_FEATURE_UNAVAILABLE_MESSAGE);
    }

    return { requires_deposit: false, deposit_amount: null };
  }

  if (!requiresDeposit) {
    return { requires_deposit: false, deposit_amount: null };
  }

  if (!canChargeDeposits) {
    throw new BadRequestException(DEPOSIT_SUBACCOUNT_REQUIRED_MESSAGE);
  }

  if (depositAmount === undefined || depositAmount === null || depositAmount <= 0) {
    throw new BadRequestException(
      'Informe o valor do sinal quando exigir pagamento antecipado.',
    );
  }

  return { requires_deposit: true, deposit_amount: depositAmount };
}
