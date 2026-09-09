import { BadRequestException } from '@nestjs/common';
import { resolveServiceDepositFields } from './service-deposit.util';

describe('service-deposit.util', () => {
  it('clears deposit fields when the plan cannot use the feature', () => {
    expect(resolveServiceDepositFields(false, false, 20)).toEqual({
      requires_deposit: false,
      deposit_amount: null,
    });
    expect(() => resolveServiceDepositFields(false, true, 20)).toThrow(
      BadRequestException,
    );
  });

  it('requires a positive amount when deposit is on', () => {
    expect(resolveServiceDepositFields(true, true, 15)).toEqual({
      requires_deposit: true,
      deposit_amount: 15,
    });
    expect(() => resolveServiceDepositFields(true, true, 0)).toThrow(
      BadRequestException,
    );
  });
});
