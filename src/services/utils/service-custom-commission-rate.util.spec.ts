import { BadRequestException } from '@nestjs/common';
import { resolveServiceCustomCommissionRate } from './service-custom-commission-rate.util';

describe('service-custom-commission-rate.util', () => {
  it('blocks custom rates on Solo', () => {
    expect(resolveServiceCustomCommissionRate('SOLO', null)).toBeNull();
    expect(() => resolveServiceCustomCommissionRate('SOLO', 10)).toThrow(
      BadRequestException,
    );
  });

  it('stores rounded rates on Pro', () => {
    expect(resolveServiceCustomCommissionRate('PRO', 12.345)).toBe(12.35);
  });
});
