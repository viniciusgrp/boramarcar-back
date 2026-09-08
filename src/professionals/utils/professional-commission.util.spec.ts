import { BadRequestException } from '@nestjs/common';
import {
  calculateCommissionAmount,
  canConfigureCommissions,
  resolveProfessionalCommissionPercent,
} from './professional-commission.util';

describe('professional-commission.util', () => {
  it('allows commissions from Pro onward', () => {
    expect(canConfigureCommissions('SOLO')).toBe(false);
    expect(canConfigureCommissions('PRO')).toBe(true);
  });

  it('rejects Solo commission configuration', () => {
    expect(resolveProfessionalCommissionPercent('SOLO')).toBe(0);
    expect(() => resolveProfessionalCommissionPercent('SOLO', 10)).toThrow(
      BadRequestException,
    );
  });

  it('rounds commission amounts to cents', () => {
    expect(calculateCommissionAmount(100, 10)).toBe(10);
  });
});
